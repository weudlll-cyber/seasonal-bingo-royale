#!/usr/bin/env bash
# @file   ops/lib/website.sh
# @module ops
# @brief  Website installs: find the running Seasonal Entertainment website, its mode, network, port and sync token.
#
# Responsibility: detect the website's mode as its own installer does: own Caddy (the Caddy
#                 container of compose project "seasonal-site", per its docs/DEPLOYMENT.md) or
#                 nginx (host nginx holds 80/443); stop plainly when neither (a dry run without
#                 Docker only shows the step). Both modes: the app joins the website's Docker
#                 network (the one of its Caddy, or in nginx mode of its "site" container:
#                 seasonal-site_default, else its only one, else asked) to reach the website's
#                 account-changes feed at site:3800 (07 §2.4). Caddy mode: every subnet of that
#                 network is trusted (Caddy reaches the app from it), SITE_DOMAIN. nginx mode:
#                 the app publishes one loopback port, its own network has a fixed subnet, which
#                 alone is trusted (never the website network); the authorize upstream is
#                 127.0.0.1:<the port in /etc/seasonal/site-local-port>, 3800 with a warning
#                 without it. The feed's token comes from /etc/seasonal/games-sync-token (root
#                 only, never printed); without it the feed stays idle, with a warning. The route
#                 file itself: ./websiteRoute.sh. For sbr status: whether the authorize endpoint
#                 answers, the proxy the app trusts (check_proxy), the feed's state.
# Used by:        ops/install.sh, ops/sbr (status, update)
# Spec:           docs/spec/09-deployment-architecture.md §1, §3, §8; docs/spec/07-integration-architecture.md §2.3

WEBSITE_PROJECT=seasonal-site
# The website installer's files on this server (routes, site-local-port, games-sync-token).
SEASONAL_ETC=${SEASONAL_ETC:-/etc/seasonal}
# The game's sign-in route (D37); the header with the proxy secret (07 §2.3).
SIGN_IN_ROUTE=/games/bingo/auth/website
SECRET_HEADER=X-Sbr-Proxy-Secret

website_caddy() {
  command -v docker >/dev/null || return 0
  docker ps --filter "label=com.docker.compose.project=$WEBSITE_PROJECT" \
    --filter label=com.docker.compose.service=caddy --format '{{.Names}}' | head -1
}

# The website's own app container ("site" of compose project seasonal-site), in either mode.
website_site() {
  command -v docker >/dev/null || return 0
  docker ps --filter "label=com.docker.compose.project=$WEBSITE_PROJECT"     --filter label=com.docker.compose.service=site --format '{{.Names}}' | head -1
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

# choose_network <container>: the compose default network of the website when the website's
# container (its Caddy, or in nginx mode its site) is on it, else its only network; with
# several, ask (or --website-network in unattended runs).
choose_network() {
  local container=$1 networks
  networks=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$container")
  if [[ -n ${SBR_WEBSITE_NETWORK:-} ]]; then
    [[ " $networks " == *" $SBR_WEBSITE_NETWORK "* ]] || die "the website's container $container is not on the network $SBR_WEBSITE_NETWORK (it is on: $networks)"
  elif [[ " $networks " == *" ${WEBSITE_PROJECT}_default "* ]]; then
    SBR_WEBSITE_NETWORK=${WEBSITE_PROJECT}_default
  elif [[ $(wc -w <<<"$networks") -eq 1 ]]; then
    SBR_WEBSITE_NETWORK=${networks// /}
  else
    ask SBR_WEBSITE_NETWORK "The website's container $container is on several networks ($networks): which one should bingo join?"
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
  elif [[ ${SBR_UPSTREAM_GIVEN:-0} != 1 ]]; then
    SBR_WEBSITE_UPSTREAM=127.0.0.1:$(site_local_port)
  fi
}

# nginx mode: the host port nginx reaches the website on, as the website's installer records it.
site_local_port() {
  local port
  port=$(tr -d '[:space:]' <"$SEASONAL_ETC/site-local-port" 2>/dev/null || true)
  if [[ $port =~ ^[0-9]{1,5}$ ]]; then printf '%s' "$port"; return 0; fi
  warn "$SEASONAL_ETC/site-local-port is missing or not a port: the authorize endpoint is asked on 127.0.0.1:3800" >&2
  printf 3800
}

# sync_token: the website's account-changes token (64 hex characters, root only), or nothing
# with a warning: the feed then stays idle. Never printed.
sync_token() {
  local token
  token=$(tr -d '[:space:]' <"$SEASONAL_ETC/games-sync-token" 2>/dev/null || true)
  if [[ $token =~ ^[0-9a-f]{64}$ ]]; then printf '%s' "$token"; return 0; fi
  warn "no valid $SEASONAL_ETC/games-sync-token: the website's account changes are not followed until it exists (run the installer or sbr update again)" >&2
}

# refresh_website <env>: on sbr update, what the website may have changed meanwhile: the
# sync token, the nginx mode's site port, the route file (new header lines).
refresh_website() {
  local env=$1 file="$SBR_ETC/$1.env"
  [[ $(env_value "$file" SBR_INSTALL_TYPE) == website ]] || return 0
  set_env_value "$file" SBR_WEBSITE_SYNC_TOKEN "$(sync_token)"
  SBR_WEBSITE_MODE=$(env_value "$file" SBR_WEBSITE_MODE)
  SBR_WEBSITE_UPSTREAM=$(env_value "$file" SBR_WEBSITE_UPSTREAM)
  SBR_WEBSITE_AUTHORIZE_PATH=$(env_value "$file" SBR_WEBSITE_AUTHORIZE_PATH)
  SBR_WEBSITE_ROUTES_DIR=$(env_value "$file" SBR_WEBSITE_ROUTES_DIR)
  SBR_APP_PORT=$(env_value "$file" SBR_APP_PORT)
  if [[ $SBR_WEBSITE_MODE == nginx ]]; then
    SBR_WEBSITE_UPSTREAM=127.0.0.1:$(site_local_port)
    set_env_value "$file" SBR_WEBSITE_UPSTREAM "$SBR_WEBSITE_UPSTREAM"
  fi
  write_route_file "$env"
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
  local caddy site
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
    SBR_WEBSITE_MODE=nginx
    # The feed at site:3800 over the website's network; the network is never trusted here.
    site=$(website_site)
    if [[ -n $site ]]; then
      choose_network "$site"
    else
      warn "no container \"site\" of the website's compose project $WEBSITE_PROJECT: the account-changes feed stays idle"
      SBR_WEBSITE_NETWORK=''
    fi
  else
    die "the Seasonal Entertainment website is not running on this server (no Caddy container of the compose project \"$WEBSITE_PROJECT\" and no nginx on ports 80/443). Install the website first (its docs/DEPLOYMENT.md), then run this installer again with --type website."
  fi
  website_defaults
  # nginx mode: the published port's connections come from the app network's gateway.
  [[ $SBR_WEBSITE_MODE == caddy ]] || SBR_TRUSTED_PROXIES=$SBR_EDGE_SUBNET
  ask SBR_WEBSITE_DOMAIN "The website's domain (e.g. example.org)"
  info "  website: $SBR_WEBSITE_MODE mode, domain $SBR_WEBSITE_DOMAIN, the app trusts $SBR_TRUSTED_PROXIES"
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

# check_proxy <env>: sbr status's line on the proxy in front (nginx port, or the website's
# network the app trusts).
check_proxy() {
  local env=$1 network now trusted extra
  # nginx mode: the app's own network with its fixed subnet (ops/compose.website-nginx.yml).
  if [[ $(env_value "$SBR_ETC/$env.env" SBR_WEBSITE_MODE) == nginx ]]; then
    info "proxy:       the website's nginx on 127.0.0.1:$(env_value "$SBR_ETC/$env.env" SBR_APP_PORT)"
    return 0
  fi
  [[ -n $(website_caddy) ]] || { warn "the website's Caddy is not running"; return 0; }
  network=$(env_value "$SBR_ETC/$env.env" SBR_WEBSITE_NETWORK)
  extra=$(env_value "$SBR_ETC/$env.env" SBR_EXTRA_PROXIES)
  now=$(network_subnets "$network")
  trusted=$(env_value "$SBR_ETC/$env.env" SBR_TRUSTED_PROXIES)
  if [[ $now${extra:+,$extra} == "$trusted" ]]; then
    info "proxy:       the website's network $network ($now)"
  else
    warn "the website's network is now $now, the app trusts $trusted: run the installer again to update it"
  fi
}

# feed_state <env>: sbr status's line on the website's account-changes feed.
feed_state() {
  local env=$1 failed
  if [[ -z $(env_value "$SBR_ETC/$env.env" SBR_WEBSITE_SYNC_TOKEN) ]]; then
    warn "website feed: idle (no $SEASONAL_ETC/games-sync-token; sbr update reads it again)"
  elif failed=$(compose "$env" exec -T app cat /data/website-feed 2>/dev/null) && [[ -n $failed ]]; then
    warn "website feed: $failed (retried every 2 minutes; play goes on)"
  else
    info "website feed: following the website's account changes"
  fi
}
