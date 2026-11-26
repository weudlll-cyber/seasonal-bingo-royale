#!/usr/bin/env bash
# @file   ops/lib/website-route.sh
# @module ops
# @brief  The installer's route-file step of a website install: a game's own route file in the
#         website's proxy (nginx or Caddy), checked, put back when refused, then reloaded.
#
# Responsibility: sourced by a game's installer. `sk_route_remove` (since v0.29.0) takes the file
#                 away again and reloads, for an uninstall. `sk_route_install` writes the file the
#                 website's
#                 proxy already imports (nginx: `include …/routes/*.conf;` in its server block;
#                 Caddy: `import /etc/caddy/routes/*.caddy` in its site block), mode 0600 because
#                 it holds the proxy secret, then runs the game's check command: a failure puts the
#                 earlier file back (or removes the new one) and nothing is reloaded; else the
#                 reload command runs. `sk_route_nginx` and `sk_route_caddy` print the content:
#                 the game's base path (HTTP and WebSocket) to the app; client-sent identity
#                 headers and the secret header cleared on every path; only `<base>/auth/website`
#                 asks the website's authorize route (with X-Original-Method, which it requires),
#                 passes the identity headers on and only then adds the secret, so the website
#                 never sees it; a refusal goes to `<base>/auth/website/login` with the same query;
#                 `<base>/metrics` is 404; the website's session cookie never reaches the app.
#                 No website file is written. Settings are SK_ROUTE_* variables
#                 (docs/OPERATIONS.md); the secret is never printed to the terminal by this file.
# Depends on:     bash 4
# Source:         seasonal-mini-games ops/lib/website-route.sh at 9e3c6f3 (the route's content, the
#                 cookie rule and the check-and-restore install), which has it from
#                 seasonal-bingo-royale's write_nginx_route and write_caddy_route (ops/lib, 8d20904).
#                 Generalised: the game's names and upstreams are variables. Left in the games:
#                 their end-of-install check through the website and their compose names.
# Spec:           website docs/AUTH.md "Embedded games" and GAME-INTEGRATION.md §2 at cc743b9;
#                 kit DECISIONS K72

sk_route_die() {
  printf 'website route: %s\n' "$*" >&2
  return 1
}

# The seven headers the website's authorize answer may carry (GAME-INTEGRATION.md §2).
SK_WEBSITE_HEADERS='X-Acting-User-Id X-Acting-User X-Acting-User-Roles
X-Acting-User-Email-Verified X-Acting-User-Can-Host X-Acting-User-Steps X-Acting-Guest'

sk_route_headers() { printf '%s' "${SK_ROUTE_IDENTITY_HEADERS:-$SK_WEBSITE_HEADERS}" | tr -s ' \n' ' '; }
sk_route_authorize() { printf '%s' "${SK_ROUTE_AUTHORIZE:-/api/games/$SK_ROUTE_GAME/authorize}"; }
sk_route_slug() { printf '%s' "${SK_ROUTE_GAME//-/_}"; }
# A header as nginx names it in a variable: lower case, "-" as "_".
sk_route_var() { printf '%s' "$1" | tr 'A-Z-' 'a-z_'; }

# sk_route_match <name> <pattern>: the setting is there and has only the expected characters, so
# no value can add a line or a directive to the proxy's configuration.
sk_route_match() {
  local value=${!1:-}
  [[ -n $value ]] || { sk_route_die "$1 is not set (see docs/OPERATIONS.md)"; return 1; }
  # The value itself is never said: one of them is the secret.
  [[ $value =~ $2 ]] || sk_route_die "$1 holds characters a route file may not carry"
}

sk_route_settings() {
  local h
  sk_route_match SK_ROUTE_GAME '^[a-z][a-z0-9-]*$' || return 1
  sk_route_match SK_ROUTE_BASE '^(/[A-Za-z0-9_-]+)+$' || return 1
  sk_route_match SK_ROUTE_SECRET_HEADER '^X-[A-Za-z0-9-]+$' || return 1
  sk_route_match SK_ROUTE_SECRET '^[A-Za-z0-9._~+/=-]+$' || return 1
  sk_route_match SK_ROUTE_APP '^[A-Za-z0-9._-]+:[0-9]+$' || return 1
  sk_route_match SK_ROUTE_WEBSITE '^[A-Za-z0-9._-]+:[0-9]+$' || return 1
  [[ $(sk_route_authorize) =~ ^(/[A-Za-z0-9_-]+)+$ ]] || { sk_route_die "SK_ROUTE_AUTHORIZE is not a plain path"; return 1; }
  for h in $(sk_route_headers); do
    [[ $h =~ ^X-[A-Za-z0-9-]+$ ]] || { sk_route_die "SK_ROUTE_IDENTITY_HEADERS names no header"; return 1; }
  done
}

# nginx lines that give the app the browser's Cookie without the website's session cookie
# (se.sid, __Host-se.sid). nginx has no global replace, so each `if` removes one pair; four cover
# both names twice. A leading "; " goes; an empty Cookie is not sent.
# The single quotes are meant: the $ in these lines are nginx's variables, not the shell's.
# shellcheck disable=SC2016
sk_route_nginx_cookie() {
  local var slug _
  slug=$(sk_route_slug)
  var="\$sk_${slug}_cookie"
  printf '    set %s $http_cookie;\n' "$var"
  for _ in 1 2 3 4; do
    printf '    if (%s ~ "^(.*?)\\s*(?:^|;)\\s*(?:__Host-)?se\\.sid=[^;]*(.*)$") { set %s $1$2; }\n' "$var" "$var"
  done
  printf '    if (%s ~ "^;\\s*(.*)$") { set %s $1; }\n' "$var" "$var"
  printf '    proxy_set_header Cookie %s;\n' "$var"
}

sk_route_nginx() {
  sk_route_settings || return 1
  local slug base=$SK_ROUTE_BASE signin="$SK_ROUTE_BASE/auth/website" h var cookie
  local clear="    proxy_set_header $SK_ROUTE_SECRET_HEADER \"\";"$'\n' pass=''
  slug=$(sk_route_slug)
  cookie=$(sk_route_nginx_cookie)
  for h in $(sk_route_headers); do
    var="sk_${slug}_$(sk_route_var "$h")"
    clear+="    proxy_set_header $h \"\";"$'\n'
    pass+="    auth_request_set \$$var \$upstream_http_$(sk_route_var "$h");"$'\n'
    pass+="    proxy_set_header $h \$$var;"$'\n'
  done
  local common="    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;"
  cat <<EOF
# $SK_ROUTE_GAME under $base (written by its installer; do not edit, run the installer again).
# The website's server block includes this folder. Only $signin asks the website who the
# visitor is and sends the app the proxy secret (this file is 0600); every other path clears
# client-sent identity headers.
location = $base { return 308 $base/; }
location ^~ $base/metrics { return 404; }
location ^~ $base/ {
${clear}${cookie}
$common
    # HTTP and the WebSocket upgrade; the app keeps the $base prefix.
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$http_connection;
    proxy_pass http://$SK_ROUTE_APP;
}
location = $signin {
    auth_request /_sk_${slug}_authorize;
${pass}    # After the authorize call, which never carries it.
    proxy_set_header $SK_ROUTE_SECRET_HEADER "$SK_ROUTE_SECRET";
    error_page 401 403 = @sk_${slug}_login;
${cookie}
$common
    proxy_pass http://$SK_ROUTE_APP;
}
location = /_sk_${slug}_authorize {
    internal;
    proxy_pass http://$SK_ROUTE_WEBSITE$(sk_route_authorize);
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header $SK_ROUTE_SECRET_HEADER "";
    proxy_set_header Host \$host;
    # The website refuses (403) a request without the browser's method (fail closed).
    proxy_set_header X-Original-Method \$request_method;
    proxy_set_header X-Original-URI \$request_uri;
}
location @sk_${slug}_login { return 302 $signin/login\$is_args\$args; }
EOF
}

sk_route_caddy() {
  sk_route_settings || return 1
  local slug base=$SK_ROUTE_BASE signin="$SK_ROUTE_BASE/auth/website" h clear=''
  slug=$(sk_route_slug)
  for h in $(sk_route_headers) "$SK_ROUTE_SECRET_HEADER"; do clear+=$'\t\t'"request_header -$h"$'\n'; done
  cat <<EOF
# $SK_ROUTE_GAME under $base (written by its installer; do not edit, run the installer again).
# Imported inside the website's site block. Only $signin asks the website who the visitor is
# and sends the app the proxy secret (this file is 0600).
redir $base $base/ 308
handle $base/* {
	# In this order (Caddy's own order would run forward_auth before request_header).
	route {
		@sk_${slug}_metrics path $base/metrics $base/metrics/*
		respond @sk_${slug}_metrics 404
		# Client-sent identity headers and proxy secrets never reach the app (nor the website).
$clear		@sk_${slug}_signin path $signin
		forward_auth @sk_${slug}_signin $SK_ROUTE_WEBSITE {
			uri $(sk_route_authorize)
			# The website refuses (403) a request without the browser's method (fail closed).
			header_up X-Original-Method {http.request.method}
			header_up X-Original-URI {http.request.uri}
			copy_headers $(sk_route_headers)
			@sk_${slug}_refused status 401 403
			handle_response @sk_${slug}_refused {
				redir * $signin/login?{query} 302
			}
		}
		# After forward_auth, so the website never sees it.
		request_header @sk_${slug}_signin $SK_ROUTE_SECRET_HEADER $SK_ROUTE_SECRET
		# After forward_auth too, which sends the website the browser's Cookie: the app gets it
		# without the website's session cookie, and an empty one not at all.
		request_header Cookie \`(^|;\\s*)(__Host-)?se\\.sid=[^;]*\` ""
		request_header Cookie \`^;\\s*\` ""
		@sk_${slug}_no_cookie header_regexp Cookie \`^\\s*\$\`
		request_header @sk_${slug}_no_cookie -Cookie
		reverse_proxy $SK_ROUTE_APP
	}
}
EOF
}

# The settings both the install and the removal need.
sk_route_target_settings() {
  sk_route_match SK_ROUTE_MODE '^(nginx|caddy)$' || return 1
  sk_route_match SK_ROUTE_FILE '^/.+\.(conf|caddy)$' || return 1
  [[ -n ${SK_ROUTE_CHECK_CMD:-} && -n ${SK_ROUTE_RELOAD_CMD:-} ]] || sk_route_die "SK_ROUTE_CHECK_CMD and SK_ROUTE_RELOAD_CMD are needed"
}

# sk_route_remove: the game's route file gone and the website's proxy reloaded; a proxy whose
# check fails (for a reason of its own) is said and not reloaded. Settings as for the install.
sk_route_remove() {
  sk_route_target_settings || return 1
  rm -f "$SK_ROUTE_FILE"
  if ! bash -c "$SK_ROUTE_CHECK_CMD"; then
    # Said, not stopped: the game's file is gone either way.
    printf 'website route: %s is removed, but the %s check fails: check it, then reload it\n' \
      "$SK_ROUTE_FILE" "$SK_ROUTE_MODE" >&2
    return 0
  fi
  bash -c "$SK_ROUTE_RELOAD_CMD" || { sk_route_die "the route file is removed, but the reload failed"; return 1; }
  printf 'route: %s removed, the website'\''s %s reloaded\n' "$SK_ROUTE_FILE" "$SK_ROUTE_MODE"
}

# sk_route_install: SK_ROUTE_MODE (nginx or caddy), SK_ROUTE_FILE, SK_ROUTE_CHECK_CMD and
# SK_ROUTE_RELOAD_CMD (each run with `bash -c`).
sk_route_install() {
  local file new old
  sk_route_target_settings || return 1
  file=$SK_ROUTE_FILE
  new="$file.new"
  old="$file.old"
  # Neither name ends in .conf or .caddy, so the website never imports them.
  rm -f "$new" "$old"
  (umask 077 && "sk_route_$SK_ROUTE_MODE" >"$new") || { rm -f "$new"; return 1; }
  [[ ! -f $file ]] || cp -p "$file" "$old"
  mv "$new" "$file"
  if ! bash -c "$SK_ROUTE_CHECK_CMD"; then
    if [[ -f $old ]]; then mv "$old" "$file"; else rm -f "$file"; fi
    sk_route_die "the website's $SK_ROUTE_MODE refused the route file; the earlier state is back, nothing was reloaded"
    return 1
  fi
  rm -f "$old"
  bash -c "$SK_ROUTE_RELOAD_CMD" || { sk_route_die "the route file is in place, but the reload failed"; return 1; }
  printf 'route: %s, the website'\''s %s reloaded\n' "$file" "$SK_ROUTE_MODE"
}
