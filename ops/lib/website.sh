#!/usr/bin/env bash
# @file   ops/lib/website.sh
# @module ops
# @brief  Website installs: find the running Seasonal Entertainment website and its mode, write the game's route file.
#
# Responsibility: detect the website's mode as its own installer does: own Caddy (the Caddy
#                 container of compose project "seasonal-site", per its docs/DEPLOYMENT.md) or
#                 nginx (host nginx holds 80/443); stop plainly when neither (a dry run without
#                 Docker only shows the step). Caddy mode: the website's Docker network
#                 (seasonal-site_default, else its only one, else asked), every subnet of it as
#                 trusted proxy ranges, SITE_DOMAIN. nginx mode: the app publishes one loopback
#                 port and its own network has a fixed subnet, which is trusted. Write the game's
#                 own route file for that mode (never a website file; 0600, it holds the proxy
#                 secret): /games/bingo/ (HTTP and WebSocket) to the app, client-sent
#                 X-Acting-User* and X-Sbr-Proxy-Secret headers cleared, the sign-in route
#                 /games/bingo/auth/website asking the website's authorize endpoint (auth_request
#                 / forward_auth), passing its four identity headers and the proxy secret (never
#                 to the website), a refusal sent to the app's /games/bingo/auth/website/login
#                 with the same query (the app sends on to the website's login with the wanted
#                 page, D43), /games/bingo/metrics 404 (D37); print the one line the website
#                 must have. For sbr status: whether the authorize endpoint answers.
# Used by:        ops/install.sh, ops/sbr (status)
# Spec:           docs/spec/09-deployment-architecture.md §1, §3, §8; docs/spec/07-integration-architecture.md §2.3

WEBSITE_PROJECT=seasonal-site
# The game's sign-in route (D37); the header with the proxy secret (07 §2.3).
SIGN_IN_ROUTE=/games/bingo/auth/website
SECRET_HEADER=X-Sbr-Proxy-Secret

website_caddy() {
  command -v docker >/dev/null || return 0
  docker ps --filter "label=com.docker.compose.project=$WEBSITE_PROJECT" \
    --filter label=com.docker.compose.service=caddy --format '{{.Names}}' | head -1
}

# The website runs behind host nginx: an nginx process listens on 80 or 443.
website_nginx() {
  command -v ss >/dev/null || return 1
  ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -q '"nginx"'
}

# network_subnets <network>: every IPAM subnet of the network (IPv4 and IPv6), comma-separated
# as SBR_TRUSTED_PROXIES takes them: Caddy may reach the app from any of them.
network_subnets() {
  docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$1" | xargs | tr ' ' ','
}

# choose_network <caddy>: the compose default network of the website when Caddy is on it,
# else its only network; with several, ask (or --website-network in unattended runs).
choose_network() {
  local caddy=$1 networks
  networks=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$caddy")
  if [[ -n ${SBR_WEBSITE_NETWORK:-} ]]; then
    [[ " $networks " == *" $SBR_WEBSITE_NETWORK "* ]] || die "the website's Caddy is not on the network $SBR_WEBSITE_NETWORK (it is on: $networks)"
  elif [[ " $networks " == *" ${WEBSITE_PROJECT}_default "* ]]; then
    SBR_WEBSITE_NETWORK=${WEBSITE_PROJECT}_default
  elif [[ $(wc -w <<<"$networks") -eq 1 ]]; then
    SBR_WEBSITE_NETWORK=${networks// /}
  else
    ask SBR_WEBSITE_NETWORK "The website's Caddy is on several networks ($networks): which one should bingo join?"
  fi
}

# The website's settings for the route file, with their defaults (flags override).
website_defaults() {
  SBR_WEBSITE_AUTHORIZE_PATH=${SBR_WEBSITE_AUTHORIZE_PATH:-/api/games/bingo/authorize}
  SBR_WEBSITE_LOGIN_PATH=${SBR_WEBSITE_LOGIN_PATH:-/login?next=}
  SBR_WEBSITE_ROUTES_DIR=${SBR_WEBSITE_ROUTES_DIR:-/etc/seasonal/routes}
  SBR_APP_PORT=${SBR_APP_PORT:-3900}
  SBR_EDGE_SUBNET=${SBR_EDGE_SUBNET:-172.30.249.0/24}
  if [[ $SBR_WEBSITE_MODE == caddy ]]; then
    SBR_WEBSITE_UPSTREAM=${SBR_WEBSITE_UPSTREAM:-site:3800}
  else
    SBR_WEBSITE_UPSTREAM=${SBR_WEBSITE_UPSTREAM:-127.0.0.1:3800}
  fi
}

detect_caddy_mode() {
  local caddy=$1
  SBR_WEBSITE_MODE=caddy
  choose_network "$caddy"
  # The whole network's ranges: Caddy keeps working for the app after it is recreated.
  SBR_TRUSTED_PROXIES=$(network_subnets "$SBR_WEBSITE_NETWORK")
  [[ -n $SBR_TRUSTED_PROXIES ]] || die "the network $SBR_WEBSITE_NETWORK has no subnet to trust (docker network inspect $SBR_WEBSITE_NETWORK)"
  if [[ -z ${SBR_WEBSITE_DOMAIN:-} ]]; then
    SBR_WEBSITE_DOMAIN=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$caddy" | sed -n 's/^SITE_DOMAIN=//p')
  fi
}

# detect_website: sets SBR_WEBSITE_MODE (caddy or nginx), SBR_TRUSTED_PROXIES, the route
# settings and (unless given) SBR_WEBSITE_DOMAIN, or stops.
detect_website() {
  local caddy
  # A dry run on a server without Docker yet cannot look; it shows the step instead.
  if [[ $SBR_DRY_RUN == 1 ]] && ! command -v docker >/dev/null; then
    info "  would detect the website's mode (its Caddy of compose project $WEBSITE_PROJECT, or host nginx on 80/443) once Docker is installed"
    SBR_WEBSITE_MODE=${SBR_WEBSITE_MODE:-caddy}
    SBR_WEBSITE_NETWORK=${SBR_WEBSITE_NETWORK:-${WEBSITE_PROJECT}_default}
    SBR_TRUSTED_PROXIES='<the website network range>'
    SBR_WEBSITE_DOMAIN=${SBR_WEBSITE_DOMAIN:-<the website domain>}
    website_defaults
    return 0
  fi
  caddy=$(website_caddy)
  if [[ -n $caddy ]]; then
    detect_caddy_mode "$caddy"
  elif website_nginx; then
    SBR_WEBSITE_MODE=nginx SBR_WEBSITE_NETWORK=''
  else
    die "the Seasonal Entertainment website is not running on this server (no Caddy container of the compose project \"$WEBSITE_PROJECT\" and no nginx on ports 80/443). Install the website first (its docs/DEPLOYMENT.md), then run this installer again with --type website."
  fi
  website_defaults
  # nginx mode: the published port's connections come from the app network's gateway.
  [[ $SBR_WEBSITE_MODE == caddy ]] || SBR_TRUSTED_PROXIES=$SBR_EDGE_SUBNET
  ask SBR_WEBSITE_DOMAIN "The website's domain (e.g. example.org)"
  info "  website: $SBR_WEBSITE_MODE mode, domain $SBR_WEBSITE_DOMAIN, the app trusts $SBR_TRUSTED_PROXIES"
}

# The identity header names: the env file's (an operator may rename them), else the defaults
# the app uses (07 §2.3), and the proxy secret. Sets H_ID, H_NAME, H_ROLES, H_VERIFIED, SECRET.
header_names() {
  local file="$SBR_ETC/$1.env"
  # A dry run has written no env file: the route file it would write is not shown anyway.
  SECRET=$(env_value "$file" SBR_WEBSITE_PROXY_SECRET)
  SECRET=${SECRET:-unset-in-a-dry-run}
  H_ID=$(env_value "$file" SBR_WEBSITE_HEADER_ID)
  H_NAME=$(env_value "$file" SBR_WEBSITE_HEADER_NAME)
  H_ROLES=$(env_value "$file" SBR_WEBSITE_HEADER_ROLES)
  H_VERIFIED=$(env_value "$file" SBR_WEBSITE_HEADER_EMAIL_VERIFIED)
  H_ID=${H_ID:-X-Acting-User-Id} H_NAME=${H_NAME:-X-Acting-User}
  H_ROLES=${H_ROLES:-X-Acting-User-Roles} H_VERIFIED=${H_VERIFIED:-X-Acting-User-Email-Verified}
}

# The header name as nginx names a response header in a variable: lower case, "-" → "_".
nginx_var() { printf '%s' "$1" | tr 'A-Z-' 'a-z_'; }

# write_route_file <env>: the game's route for the website's proxy (route_steps says how).
write_route_file() {
  header_names "$1"
  if [[ $SBR_WEBSITE_MODE == nginx ]]; then
    write_nginx_route "$1" | put_file "$SBR_WEBSITE_ROUTES_DIR/bingo.conf" 0600
  else
    write_caddy_route "$1" | put_file "$SBR_ROOT/routes/bingo.caddy" 0600
  fi
}

write_nginx_route() {
  local h clear="    proxy_set_header $SECRET_HEADER \"\";"$'\n' set=''
  for h in "$H_ID" "$H_NAME" "$H_ROLES" "$H_VERIFIED"; do
    clear+="    proxy_set_header $h \"\";"$'\n'
    set+="    auth_request_set \$sbr_$(nginx_var "$h") \$upstream_http_$(nginx_var "$h");"$'\n'
    set+="    proxy_set_header $h \$sbr_$(nginx_var "$h");"$'\n'
  done
  cat <<EOF
# Seasonal Bingo Royale under /games/bingo (written by ops/install.sh, environment $1).
# Included inside the website's server block:  include $SBR_WEBSITE_ROUTES_DIR/*.conf;
# Only $SIGN_IN_ROUTE asks the website who the visitor is (D37) and sends the app the
# proxy secret (keep this file 0600); every other route clears client-sent identity headers.
location = /games/bingo { return 308 /games/bingo/; }
location ^~ /games/bingo/metrics { return 404; }
location ^~ /games/bingo/ {
${clear}    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    # HTTP and the WebSocket upgrade; the app keeps the /games/bingo prefix (SBR_BASE_PATH).
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_pass http://127.0.0.1:$SBR_APP_PORT;
}
location = $SIGN_IN_ROUTE {
    auth_request /_sbr_bingo_authorize;
${set}    proxy_set_header $SECRET_HEADER "$SECRET";
    error_page 401 403 = @sbr_bingo_login;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://127.0.0.1:$SBR_APP_PORT;
}
location = /_sbr_bingo_authorize {
    internal;
    proxy_pass http://$SBR_WEBSITE_UPSTREAM$SBR_WEBSITE_AUTHORIZE_PATH;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Host \$host;
    proxy_set_header X-Original-Method \$request_method;
    proxy_set_header X-Original-URI \$request_uri;
}
# A visitor the website refused: the app sends on to the website's login with the page (D43).
location @sbr_bingo_login { return 302 $SIGN_IN_ROUTE/login\$is_args\$args; }
EOF
}

write_caddy_route() {
  cat <<EOF
# Seasonal Bingo Royale under /games/bingo (written by ops/install.sh, environment $1).
# Imported inside the website's {\$SITE_DOMAIN} block (import /etc/caddy/routes/*.caddy);
# "handle /games/bingo/*" (a path matcher) runs before the site's catch-all. Only
# $SIGN_IN_ROUTE asks the website who the visitor is (D37) and sends the app the proxy
# secret (keep this file 0600 and out of version control).
redir /games/bingo /games/bingo/ 308
handle /games/bingo/* {
	# In this order (Caddy's own order would run forward_auth before request_header).
	route {
		# Metrics stay inside the server (the app refuses proxied requests to them as well).
		@sbr_metrics path /games/bingo/metrics /games/bingo/metrics/*
		respond @sbr_metrics 404
		# Client-sent identity headers and proxy secrets never reach the app.
		request_header -$H_ID
		request_header -$H_NAME
		request_header -$H_ROLES
		request_header -$H_VERIFIED
		request_header -$SECRET_HEADER
		@sbr_signin path $SIGN_IN_ROUTE
		forward_auth @sbr_signin $SBR_WEBSITE_UPSTREAM {
			uri $SBR_WEBSITE_AUTHORIZE_PATH
			copy_headers $H_ID $H_NAME $H_ROLES $H_VERIFIED
			# A visitor the website refused: the app sends on to its login with the page (D43).
			@sbr_refused status 401 403
			handle_response @sbr_refused {
				redir * $SIGN_IN_ROUTE/login?{query} 302
			}
		}
		# After forward_auth, so the website never sees it.
		request_header @sbr_signin $SECRET_HEADER $SECRET
		# HTTP and the WebSocket upgrade; the app keeps the /games/bingo prefix (SBR_BASE_PATH).
		reverse_proxy sbr-bingo-$1:3000
	}
}
EOF
}

# route_steps: how the website takes the route file (printed at the end).
route_steps() {
  if [[ $SBR_WEBSITE_MODE == nginx ]]; then
    cat <<EOF
The website (nginx mode) needs one line, once, inside its server block for $SBR_WEBSITE_DOMAIN:
          include $SBR_WEBSITE_ROUTES_DIR/*.conf;
     then: nginx -t && systemctl reload nginx
     The website must answer $SBR_WEBSITE_AUTHORIZE_PATH on $SBR_WEBSITE_UPSTREAM (docs/operator-guide.md, "Website login").
     Then open https://$SBR_WEBSITE_DOMAIN/games/bingo/
EOF
    return 0
  fi
  cat <<EOF
Add bingo to the website's Caddy (once, on this server):
     a. In the website checkout, create deploy/site/routes/ and copy the route file into it, kept
        private (it holds the proxy secret; keep routes/ out of version control):
          install -m 0600 $SBR_ROOT/routes/bingo.caddy <website checkout>/deploy/site/routes/
     b. In deploy/site/Caddyfile, inside the {\$SITE_DOMAIN} { … } block, add the line:
          import /etc/caddy/routes/*.caddy
     c. In deploy/site/docker-compose.yml, give the caddy service the volume:
          - ./routes:/etc/caddy/routes:ro
     d. Apply it:  cd <website checkout>/deploy/site && docker compose up -d caddy
        (a later change to bingo.caddy only needs:  docker exec $(website_caddy) caddy reload --config /etc/caddy/Caddyfile)
     The website must answer $SBR_WEBSITE_AUTHORIZE_PATH on $SBR_WEBSITE_UPSTREAM (docs/operator-guide.md, "Website login").
     Then open https://$SBR_WEBSITE_DOMAIN/games/bingo/
EOF
}

# authorize_status <env>: the HTTP status the website's authorize endpoint gives a request
# without a browser session (401 expected), or "no answer".
authorize_status() {
  local file="$SBR_ETC/$1.env" mode upstream path url code caddy
  mode=$(env_value "$file" SBR_WEBSITE_MODE)
  upstream=$(env_value "$file" SBR_WEBSITE_UPSTREAM)
  path=$(env_value "$file" SBR_WEBSITE_AUTHORIZE_PATH)
  url="http://$upstream$path"
  if [[ $mode == nginx ]]; then
    code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$url" || true)
  else
    caddy=$(website_caddy)
    [[ -n $caddy ]] && code=$(docker exec "$caddy" wget -S -q -O /dev/null -T 5 "$url" 2>&1 | awk '/HTTP\//{print $2; exit}' || true)
  fi
  [[ -n ${code:-} && $code != 000 ]] && printf '%s' "$code" || printf 'no answer'
}
