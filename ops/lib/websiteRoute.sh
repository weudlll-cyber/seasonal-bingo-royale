#!/usr/bin/env bash
# @file   ops/lib/websiteRoute.sh
# @module ops
# @brief  Website installs: the game's own route file for the website's nginx or Caddy (D37).
#
# Responsibility: write the route file for the website's mode (never a website file; 0600, it
#                 holds the proxy secret): /games/bingo/ (HTTP and WebSocket) to the app with
#                 every identity header (X-Acting-User*, X-Acting-Guest) and the proxy secret
#                 cleared from browser requests on every game path; only the sign-in route
#                 /games/bingo/auth/website asks the website's authorize endpoint (auth_request /
#                 forward_auth, passing Cookie, Origin, Host and X-Original-Method) and copies its
#                 answer's identity headers (id, name, roles, e-mail verified, may host, steps,
#                 guest) plus the proxy secret (never to the website) to the app; a 401/403 from an
#                 older website goes to the app's /games/bingo/auth/website/login with the same
#                 query (D43); /games/bingo/metrics 404. Header names: the env file's (an operator
#                 may rename them), else the app's defaults (07 §2.3).
# Used by:        ./websiteApply.sh (install, update)
# Spec:           docs/spec/09-deployment-architecture.md §3; docs/spec/07-integration-architecture.md §2.3

# The identity header names and the proxy secret: sets HEADERS (all identity headers, in
# order), SECRET.
header_names() {
  local file="$SBR_ETC/$1.env" key name
  # A dry run has written no env file: the route file it would write is not shown anyway.
  SECRET=$(env_value "$file" SBR_WEBSITE_PROXY_SECRET)
  SECRET=${SECRET:-unset-in-a-dry-run}
  HEADERS=()
  for key in ID:X-Acting-User-Id NAME:X-Acting-User ROLES:X-Acting-User-Roles \
    EMAIL_VERIFIED:X-Acting-User-Email-Verified CAN_HOST:X-Acting-User-Can-Host \
    STEPS:X-Acting-User-Steps GUEST:X-Acting-Guest; do
    name=$(env_value "$file" "SBR_WEBSITE_HEADER_${key%%:*}")
    HEADERS+=("${name:-${key#*:}}")
  done
}

# The header name as nginx names a response header in a variable: lower case, "-" → "_".
nginx_var() { printf '%s' "$1" | tr 'A-Z-' 'a-z_'; }

write_nginx_route() {
  local h clear="    proxy_set_header $SECRET_HEADER \"\";"$'\n' set=''
  for h in "${HEADERS[@]}"; do
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
    # The website's answer only: a browser-sent identity header never reaches the app.
${set}    proxy_set_header $SECRET_HEADER "$SECRET";
    # An older website answers 401/403 for a visitor it does not know (a newer one 204 + guest).
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
    proxy_set_header Cookie \$http_cookie;
    proxy_set_header Origin \$http_origin;
    proxy_set_header X-Original-Method \$request_method;
    proxy_set_header X-Original-URI \$request_uri;
}
# A visitor the website refused: the app sends on to the website's login with the page (D43).
location @sbr_bingo_login { return 302 $SIGN_IN_ROUTE/login\$is_args\$args; }
EOF
}

write_caddy_route() {
  local h clear=''
  for h in "${HEADERS[@]}" "$SECRET_HEADER"; do clear+=$'\t\t'"request_header -$h"$'\n'; done
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
${clear}		@sbr_signin path $SIGN_IN_ROUTE
		forward_auth @sbr_signin $SBR_WEBSITE_UPSTREAM {
			uri $SBR_WEBSITE_AUTHORIZE_PATH
			# Cookie, Origin and Host travel with the request; the method as the website reads it.
			header_up X-Original-Method {method}
			copy_headers ${HEADERS[*]}
			# An older website refuses an unknown visitor (a newer one answers 204 + guest).
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
