# shellcheck shell=bash
# @file   ops/test/real-site-bingo.sh
# @module ops/test
# @brief  The bingo side of the rehearsal against the real website (sourced by ./real-site.sh).
#
# Responsibility: inside the website harness's server ($SERVER, on_server, ok, check, say from
#                 the website's deploy/test/run.sh): copy this repository's committed tree in
#                 as /root/sbr (its own origin, so the installer builds it at master), the
#                 website's own checks after every bingo step, a fingerprint of everything of
#                 the website (its tree, nginx's or Caddy's files except the bingo route, the
#                 site container's start) that must not change, the bingo install through
#                 ./real-site.exp with its checks (no other question; domain and mode from
#                 /etc/seasonal/install.conf; route file applied and reloaded; `sbr status`),
#                 the browser phases (./realSite.spec.ts in a Playwright container on the test
#                 network) and the in-server helper ./real-site-admin.sh.
# Depends on:     docker, git, tar, ./real-site.exp, ./real-site-admin.sh, ./realSite.spec.ts,
#                 ./playwright.real-site.config.ts
# Used by:        ./real-site.sh
# Spec:           docs/spec/09-deployment-architecture.md §3; docs/spec/07-integration-architecture.md §2

BROWSER_IMAGE=sbr-real-site-browser
PLAYWRIGHT=mcr.microsoft.com/playwright:v1.64.1-noble

# The repository's committed tree in the server, a git repository of its own at master.
copy_bingo() {
  (cd "$SBR" && git archive --format=tar HEAD) | on_server sh -c 'rm -rf /root/sbr && mkdir -p /root/sbr && tar -C /root/sbr -xf -'
  on_server sh -c 'cd /root/sbr && git init -q -b master && git add -A &&
    git -c user.name=test -c user.email=test@example.org commit -qm rehearsal && git remote add origin /root/sbr'
  for file in real-site.exp:sbr-install.exp real-site-admin.sh:sbr-admin.sh; do
    on_server install -m 755 "/root/sbr/ops/test/${file%%:*}" "/etc/seasonal-test/${file##*:}"
  done
}

# The website's own checks for this mode (run.sh's set after an install).
website_checks() {
  check health || FAILED=1
  check admin || FAILED=1
  check modes || FAILED=1
  check status "$MODE" || FAILED=1
  [[ $MODE == caddy ]] || { check other || FAILED=1; check unknown-name || FAILED=1; }
}

# Everything of the website the bingo must leave alone, as one hash.
website_print() {
  on_server bash -c 'set -o pipefail; {
    git -C /opt/seasonal-entertainment rev-parse HEAD
    git -C /opt/seasonal-entertainment status --porcelain | grep -v "routes/bingo" || true
    find /etc/nginx /opt/seasonal-entertainment/deploy/site -type f \( -name "*.conf" -o -name "Caddyfile" -o -name "*.caddy" \) \
      -not -name "bingo.*" 2>/dev/null | sort | xargs -r sha256sum
    docker inspect -f "{{.State.StartedAt}}" seasonal-site-site-1
  } | sha256sum'
}

admin() { docker exec -i -e TEST_ADMIN_PASSWORD "$SERVER" /etc/seasonal-test/sbr-admin.sh "$@"; }

# The route file the installer applied, in this mode.
route_file() {
  if [[ $MODE == nginx ]]; then echo /etc/seasonal/routes/bingo.conf; else echo /opt/seasonal-entertainment/deploy/site/routes/bingo.caddy; fi
}

bingo_install() {
  local age from
  age=$(on_server age-keygen -y /etc/seasonal-test/age-key.txt)
  from=$(($(wc -l <"$RESULTS") + 1))
  say "--- the bingo install: the one documented command, three answers"
  on_server env AGE_KEY="$age" /etc/seasonal-test/sbr-install.exp 2>&1 | tr -d '\r' | sed 's/^/    /' | tee -a "$RESULTS" || true
  ok "no other question than environment, e-mail and age key" output_lacks "$from" 'UNEXPECTED QUESTION'
  ok "the install finished" output_has "$from" "checked through the website's proxy"
  ok "the domain came from the website's record" output_has "$from" 'example.org'
  ok "the route file was applied" on_server test -s "$(route_file)"
  # Its own answer (the website's pages answer 200 for any path too).
  ok "the game answers through the website (HTTPS, Pebble)" test "$(on_server curl -fsS \
    --cacert /etc/seasonal-test/pebble-root.pem https://example.org/games/bingo/healthz)" = '{"status":"ok"}'
  bingo_status
}

bingo_status() {
  local status
  status=$(on_server sbr status 2>&1 || true)
  printf '%s\n' "$status" | sed 's/^/    /' >>"$RESULTS"
  ok "sbr status: sign-in website" grep -q 'sign-in:     website' <<<"$status"
  ok "sbr status: authorize 204" grep -q ': 204' <<<"$status"
  ok "sbr status: feed following" grep -q "following the website's account changes" <<<"$status"
}

# The browser image: Playwright's with @playwright/test of the same version, labelled for cleanup.
browser_image() {
  docker build -q --label "$LABEL" -t "$BROWSER_IMAGE" - >/dev/null <<EOF
FROM $PLAYWRIGHT
WORKDIR /work
RUN npm init -y >/dev/null && npm i -s @playwright/test@1.64.1
EOF
}

# browser PHASE: one phase of ./realSite.spec.ts on the test network (DNS: the test's names).
browser() {
  say "--- browser: phase $1"
  docker run --rm --label "$LABEL" --network "$NET" --dns 10.77.0.53 --ipc host \
    -v "$(host_path "$STATE"):/state" \
    -v "$(host_path "$SBR/ops/test/realSite.spec.ts"):/work/realSite.spec.ts:ro" \
    -v "$(host_path "$SBR/ops/test/playwright.real-site.config.ts"):/work/playwright.config.ts:ro" \
    "$BROWSER_IMAGE" npx playwright test --grep "$1 " 2>&1 | tr -d '\r' | sed 's/^/    /' | tee -a "$RESULTS"
  local code=${PIPESTATUS[0]}
  ok "browser phase $1" test "$code" -eq 0
}

# The matches the phases use, made by the website's admin (a game admin, D41) with two members
# registered through the website's own registration: one running to watch, one lobby to join.
prepare_matches() {
  local classic watch play run name
  run=$(openssl rand -hex 2)
  admin admin-login
  WATCHERS=("watch1x$run" "watch2x$run")
  for name in "${WATCHERS[@]}"; do admin register "$name" "pass-$name-123"; admin signin "$name" "pass-$name-123"; done
  classic='"gameType":"classic","prizes":["rows-1"],"missedNumbers":{"kind":"autoMarkAfter","delayMs":1000},"maxPlayers":8'
  watch=$(admin create admin "{\"title\":\"Watch me\",\"drawMode\":\"auto\",\"drawIntervalMs\":60000,$classic}")
  for name in "${WATCHERS[@]}"; do admin join "$name" "$watch" >/dev/null; done
  admin start admin "$watch" >/dev/null
  play=$(admin create admin "{\"title\":\"Play with me\",\"drawMode\":\"host\",$classic}")
  printf '{"watch":"%s","play":"%s","member":"%s","password":"%s"}\n' "$watch" "$play" \
    "realm$(openssl rand -hex 3)" "member-$(openssl rand -hex 6)" >"$STATE/state.json"
  ok "the matches for the browser exist" test -n "$watch" -a -n "$play"
}
