#!/usr/bin/env bash
# @file   ops/lib/websiteApply.sh
# @module ops
# @brief  Website installs: put the game's route file in place, apply it with a rollback, check it through the proxy.
#
# Responsibility: nginx mode: <routes dir>/bingo.conf (0600), `nginx -t`; it fails → the previous
#                 file back (or the new one removed), `nginx -t` green again, stop with nginx's
#                 error; it passes → `systemctl reload nginx`. Own-Caddy mode with the website's
#                 checkout known (/etc/seasonal/install.conf INSTALL_DIR): <checkout>/deploy/site/
#                 routes/bingo.caddy (0600), after checking the running Caddy has /etc/caddy/routes
#                 mounted (else stop: run the website installer with --update), `caddy validate`
#                 inside the container; it fails → restore and stop; it passes → `caddy reload`.
#                 Without the checkout (an older website): the file in /opt/sbr/routes and the
#                 manual steps of docs/operator-guide.md. No other website file is touched; the
#                 website keeps working whatever happens. remove_route_file undoes it (uninstall).
#                 final_checks: through the real proxy (curl --resolve to this server):
#                 /games/bingo/ answers 200, the sign-in route without a cookie ends at the
#                 website's /login?next=…, the authorize endpoint answers 204 with X-Acting-Guest
#                 (an older website: 401), the account-changes feed answers the app; each failing
#                 check named plainly.
# Depends on:     ./common.sh, ./website.sh, ./websiteRoute.sh, docker, nginx, curl
# Used by:        ops/install.sh, ops/sbr (update, uninstall)
# Spec:           docs/spec/09-deployment-architecture.md §3; docs/spec/07-integration-architecture.md §2.3

# The Caddy route file's place in the website's checkout (own-Caddy mode), or nothing.
caddy_route_target() {
  [[ -n ${SBR_SITE_DIR:-} ]] && printf '%s/deploy/site/routes/bingo.caddy' "$SBR_SITE_DIR"
}

# restore_file <target> <saved copy or empty>: the previous file back, or the new one removed.
restore_file() {
  if [[ -n $2 ]]; then mv -f "$2" "$1"; else rm -f "$1"; fi
}

# keep_copy <target>: a copy of the current file beside it (not *.conf, so nginx never reads
# it), or nothing when there is none.
keep_copy() {
  [[ -f $1 ]] || return 0
  cp -p "$1" "$1.sbr-previous"
  printf '%s' "$1.sbr-previous"
}

apply_nginx_route() {
  local env=$1 target="$SBR_WEBSITE_ROUTES_DIR/bingo.conf" saved error
  saved=$(keep_copy "$target")
  write_nginx_route "$env" | put_file "$target" 0600
  if ! error=$(nginx -t 2>&1); then
    restore_file "$target" "$saved"
    nginx -t -q 2>/dev/null || warn "nginx -t still fails after putting the previous route file back: check the website's nginx"
    die "the game's route file made nginx -t fail, so it was rolled back (the website is unchanged): $error"
  fi
  [[ -z $saved ]] || rm -f "$saved"
  systemctl reload nginx
  info "  route file: $target, nginx reloaded"
}

apply_caddy_route() {
  local env=$1 target caddy saved error
  target=$(caddy_route_target)
  caddy=$(website_caddy)
  [[ -n $caddy ]] || die "the website's Caddy is not running"
  docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' "$caddy" | grep -qw /etc/caddy/routes ||
    die "the website's Caddy has no /etc/caddy/routes yet: run the website installer again with --update, then this installer"
  saved=$(keep_copy "$target")
  install -d -m 0755 "${target%/*}"
  write_caddy_route "$env" | put_file "$target" 0600
  if ! error=$(docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1); then
    restore_file "$target" "$saved"
    die "the game's route file made caddy validate fail, so it was rolled back (the website is unchanged): $(tail -3 <<<"$error")"
  fi
  [[ -z $saved ]] || rm -f "$saved"
  docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  info "  route file: $target, Caddy reloaded"
}

# apply_route_file <env>: the route file in place and live (dry run: shown only).
apply_route_file() {
  header_names "$1"
  if [[ $SBR_DRY_RUN == 1 ]]; then
    info "  would write the game's route file and reload the website's $SBR_WEBSITE_MODE"
  elif [[ $SBR_WEBSITE_MODE == nginx ]]; then
    apply_nginx_route "$1"
  elif [[ -n $(caddy_route_target) ]]; then
    apply_caddy_route "$1"
  else
    write_caddy_route "$1" | put_file "$SBR_ROOT/routes/bingo.caddy" 0600
    warn "the website's checkout is unknown (no INSTALL_DIR in $SEASONAL_ETC/install.conf): add $SBR_ROOT/routes/bingo.caddy by hand (docs/operator-guide.md, \"Website by hand\")"
  fi
}

# remove_route_file <env>: the game's own route file gone, the website reloaded and still valid.
remove_route_file() {
  local file="$SBR_ETC/$1.env" target caddy
  if [[ $(env_value "$file" SBR_WEBSITE_MODE) == nginx ]]; then
    rm -f "$(env_value "$file" SBR_WEBSITE_ROUTES_DIR)/bingo.conf"
    if nginx -t -q 2>/dev/null; then systemctl reload nginx; else warn "nginx -t fails: check the website's nginx"; fi
    return 0
  fi
  rm -f "$SBR_ROOT/routes/bingo.caddy"
  SBR_SITE_DIR=$(env_value "$file" SBR_SITE_DIR)
  target=$(caddy_route_target)
  caddy=$(website_caddy)
  [[ -n $target ]] || { warn "remove bingo.caddy from the website checkout's deploy/site/routes/ and reload its Caddy yourself"; return 0; }
  rm -f "$target"
  [[ -n $caddy ]] || return 0
  if docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
  else
    warn "caddy validate fails: check the website's Caddy"
  fi
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
