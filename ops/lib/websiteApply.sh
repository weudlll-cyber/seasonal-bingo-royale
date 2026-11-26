#!/usr/bin/env bash
# @file   ops/lib/websiteApply.sh
# @module ops
# @brief  Website installs: put the game's route file in place, apply it with a rollback, check it through the proxy.
#
# Responsibility: the kit's route step with Bingo's settings (it writes the file 0600, checks the
#                 proxy, puts the earlier file back on a refusal, else reloads): nginx mode
#                 <routes dir>/bingo.conf; own-Caddy mode with the checkout known (install.conf
#                 INSTALL_DIR) deploy/site/routes/bingo.caddy once Caddy has /etc/caddy/routes
#                 mounted; without the checkout /opt/sbr/routes and the manual steps of
#                 docs/operator-guide.md. remove_route_file undoes it. final_checks go through the
#                 real proxy: game 200, sign-in to /login?next=, authorize 204 (older: 401), feed.
# Depends on:     ./common.sh, ./website.sh, ../kit/lib/website-route.sh, docker, nginx, curl
# Used by:        ops/install.sh, ops/sbr (update, uninstall)
# Spec:           docs/spec/09-deployment-architecture.md §3; docs/spec/07-integration-architecture.md §2.3

# The Caddy route file's place in the website's checkout (own-Caddy mode), or nothing.
caddy_route_target() {
  [[ -n ${SBR_SITE_DIR:-} ]] && printf '%s/deploy/site/routes/bingo.caddy' "$SBR_SITE_DIR"
}

# header_names <env>: HEADERS (all identity headers, in order) and SECRET: the env file's
# names, else the app's defaults (07 §2.3).
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

# route_settings <env>: Bingo's settings of the kit's route step (../kit/lib/website-route.sh,
# K72), exported: its names, the app and the website as the website's proxy reaches them, the
# route file and the proxy's check and reload. In own-Caddy mode they need the website's Caddy.
route_settings() {
  local env=$1 caddy check
  header_names "$env"
  export SK_ROUTE_GAME=bingo SK_ROUTE_BASE=/games/bingo SK_ROUTE_SECRET_HEADER=$SECRET_HEADER
  export SK_ROUTE_SECRET=$SECRET SK_ROUTE_IDENTITY_HEADERS="${HEADERS[*]}"
  export SK_ROUTE_WEBSITE=$SBR_WEBSITE_UPSTREAM SK_ROUTE_AUTHORIZE=$SBR_WEBSITE_AUTHORIZE_PATH
  export SK_ROUTE_MODE=$SBR_WEBSITE_MODE
  if [[ $SBR_WEBSITE_MODE == nginx ]]; then
    export SK_ROUTE_APP=127.0.0.1:$SBR_APP_PORT SK_ROUTE_FILE=$SBR_WEBSITE_ROUTES_DIR/bingo.conf
    export SK_ROUTE_CHECK_CMD='nginx -t -q' SK_ROUTE_RELOAD_CMD='systemctl reload nginx'
    return 0
  fi
  caddy=$(website_caddy)
  check="docker exec $caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile"
  export SK_ROUTE_APP=sbr-bingo-$env:3000 SK_ROUTE_FILE=$(caddy_route_target)
  export SK_ROUTE_CHECK_CMD="$check >/dev/null"
  export SK_ROUTE_RELOAD_CMD="docker exec $caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null"
}

apply_caddy_route() {
  local caddy
  caddy=$(website_caddy)
  [[ -n $caddy ]] || die "the website's Caddy is not running"
  docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' "$caddy" | grep -qw /etc/caddy/routes ||
    die "the website's Caddy has no /etc/caddy/routes yet: run the website installer again with --update, then this installer"
  route_settings "$1"
  install -d -m 0755 "${SK_ROUTE_FILE%/*}"
  sk_route_install || die "the game's route file was not applied (message above); the website is unchanged"
}

# apply_route_file <env>: the route file in place and live (dry run: shown only).
apply_route_file() {
  if [[ $SBR_DRY_RUN == 1 ]]; then
    info "  would write the game's route file and reload the website's $SBR_WEBSITE_MODE"
  elif [[ $SBR_WEBSITE_MODE == nginx ]]; then
    route_settings "$1"
    sk_route_install || die "the game's route file was not applied (message above); the website is unchanged"
  elif [[ -n $(caddy_route_target) ]]; then
    apply_caddy_route "$1"
  else
    # No checkout to write into: the file for the manual steps.
    route_settings "$1"
    sk_route_caddy | put_file "$SBR_ROOT/routes/bingo.caddy" 0600
    warn "the website's checkout is unknown (no INSTALL_DIR in $SEASONAL_ETC/install.conf): add $SBR_ROOT/routes/bingo.caddy by hand (docs/operator-guide.md, \"Website by hand\")"
  fi
}

# remove_route_file <env>: the game's own route file gone, the website reloaded and still valid.
remove_route_file() {
  local env=$1 file="$SBR_ETC/$1.env"
  rm -f "$SBR_ROOT/routes/bingo.caddy"
  load_route_values "$file"
  if [[ $SBR_WEBSITE_MODE != nginx ]]; then
    if [[ -z $(caddy_route_target) ]]; then
      warn "remove bingo.caddy from the website checkout's deploy/site/routes/ and reload its Caddy yourself"
      return 0
    fi
    [[ -n $(website_caddy) ]] || { rm -f "$(caddy_route_target)"; return 0; }
  fi
  route_settings "$env"
  sk_route_remove || warn "the website's proxy did not reload: check it"
}

# through <url path> [curl options]: the website's answer for this server, by its own name
# (https; plain http when nothing answers there, as on a test machine).
through() {
  local path=$1 code
  shift
  code=$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' --resolve "$SBR_WEBSITE_DOMAIN:443:127.0.0.1" "$@" "https://$SBR_WEBSITE_DOMAIN$path" || true)
  [[ ${code%% *} != 000 ]] || code=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve "$SBR_WEBSITE_DOMAIN:80:127.0.0.1" "$@" "http://$SBR_WEBSITE_DOMAIN$path" || true)
  printf '%s' "$code"
}

# final_checks <env>: through the real proxy; each failing check named. Returns the failures.
final_checks() {
  local env=$1 failed=0 answer hop
  answer=$(through /games/bingo/)
  [[ ${answer%% *} == 200 ]] || { warn "check failed: https://$SBR_WEBSITE_DOMAIN/games/bingo/ answers ${answer%% *}, not 200"; failed=$((failed + 1)); }
  hop=$(through "$SIGN_IN_ROUTE")
  # The redirect's path on the same site (curl reports it as an absolute URL).
  answer=$(through "/$(sed -E 's#^[a-z]+://[^/]+/##' <<<"${hop#* }")")
  [[ ${hop#* } == *"$SIGN_IN_ROUTE/login"* && ${answer#* } == *"/login?next="* ]] ||
    { warn "check failed: the sign-in route without a website session does not end at the website's login (${hop#* } → ${answer#* })"; failed=$((failed + 1)); }
  answer=$(authorize_status "$env")
  [[ $answer == 204 || $answer == 401 ]] || { warn "check failed: the website's authorize endpoint answers $answer (204 with X-Acting-Guest expected)"; failed=$((failed + 1)); }
  answer=$(feed_status "$env")
  [[ $answer == 200 || $answer == idle ]] || { warn "check failed: the app cannot read the website's account-changes feed ($answer)"; failed=$((failed + 1)); }
  ((failed == 0)) && info "  checked through the website's proxy: the game, its sign-in and the website's answers work"
  return "$failed"
}

# feed_status <env>: the feed's HTTP status from inside the app, or idle without the token.
feed_status() {
  [[ -n $(env_value "$SBR_ETC/$1.env" SBR_WEBSITE_SYNC_TOKEN) ]] || { printf idle; return 0; }
  compose "$1" exec -T app node -e '
    const url = process.env.SBR_WEBSITE_FEED_URL || "http://site:3800/api/games/bingo/account-changes";
    fetch(`${url}?since=0`, { headers: { "x-games-sync-token": process.env.SBR_WEBSITE_SYNC_TOKEN } })
      .then((r) => console.log(r.status), () => console.log("no answer"))' 2>/dev/null || printf 'no answer'
}
