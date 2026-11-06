#!/usr/bin/env bash
# @file   ops/test/real-site.sh
# @module ops/test
# @brief  The move rehearsed against the REAL website installer, in nginx or own-Caddy mode.
#
# Responsibility: clones the website (github.com/weudlll-cyber/seasonal-entertainment) at the
#                 given ref (it must contain SE-EMBEDDED-GAMES, merge 82e9e30) and reuses its own
#                 end-to-end harness (deploy/test/run.sh without its last line: a systemd Ubuntu
#                 24.04 container, Pebble for Let's Encrypt, the test DNS, run-installer.exp,
#                 checks.sh) to install the real website with BINGO=yes; its checks must pass.
#                 Then, in that server: the bingo install from this repository's committed tree
#                 with the documented one command (./real-site.exp), the browser phases
#                 (./realSite.spec.ts: guest, join through the website's login and registration,
#                 the chat room, the right to start games, lock, unlock, delete) around the
#                 website admin's steps (./real-site-admin.sh), and the website's own checks and
#                 an unchanged website after the install, a re-run, `sbr update` and
#                 `sbr uninstall`. Prints PASS/FAIL per check and the website SHA. Everything it
#                 made carries the harness's label and is removed at the end (KEEP=1 keeps it).
#                 Not part of CI (Docker with privileged containers, about an hour per mode).
#                 KEEP=1 leaves the server; RESUME=1 then reuses it and its website for a faster
#                 try of the bingo part (a fresh run is the real rehearsal).
# Depends on:     docker, git, ./real-site-bingo.sh (and what it uses)
# Spec:           docs/operator-guide.md (rehearsal); docs/spec/09-deployment-architecture.md §3
#
# Usage: [KEEP=1] [RESUME=1] bash ops/test/real-site.sh nginx|caddy <website-ref>
set -euo pipefail

MODE=${1:?nginx or caddy}
WEB_REF=${2:?the website ref, e.g. master}
[[ $MODE == nginx || $MODE == caddy ]] || { echo "the mode is nginx or caddy" >&2; exit 2; }
SBR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WEB=$(mktemp -d)
STATE=$(mktemp -d)
git clone -q https://github.com/weudlll-cyber/seasonal-entertainment.git "$WEB"
git -C "$WEB" checkout -q "$WEB_REF"
WEB_SHA=$(git -C "$WEB" rev-parse HEAD)
if ! git -C "$WEB" merge-base --is-ancestor 82e9e30 HEAD; then
  echo "STOP: website $WEB_SHA does not contain SE-EMBEDDED-GAMES (merge 82e9e30)" >&2
  exit 1
fi
# Git Bash on Windows: container paths stay as written from here on (the website's harness
# sets it too); not before, so git above got the temporary folder converted.
export MSYS_NO_PATHCONV=1
# The website's harness as a library: everything but its last line, `main "$@"`.
sed '$d' "$WEB/deploy/test/run.sh" >"$WEB/deploy/test/run-lib.sh"
# shellcheck source=/dev/null
source "$WEB/deploy/test/run-lib.sh"
# shellcheck source=ops/test/real-site-bingo.sh
source "$SBR/ops/test/real-site-bingo.sh"
trap 'cleanup; rm -rf "$WEB" "$STATE"' EXIT
FAILED=0
# The harness's ok, but a FAIL is recorded and the rehearsal goes on, so every check reports.
ok() {
  local what=$1
  shift
  if "$@"; then say "PASS $what"; else say "FAIL $what"; FAILED=1; fi
}
probe() { "$@" || FAILED=1; }

website_install() {
  say "=== real website $WEB_SHA ($WEB_REF), mode $MODE"
  infrastructure
  start_server 24.04
  [[ $MODE == caddy ]] || on_server /etc/seasonal-test/prepare-nginx.sh | tee -a "$RESULTS"
  # No calls, no www redirect, no backups: the website's own scenarios test those.
  answers "" no no no ""
  on_server sh -c 'echo BINGO=yes >>/etc/seasonal-test/answers'
  run_installer --answers /etc/seasonal-test/answers --yes
  website_checks
  # The website must work before anything of the bingo is installed.
  [[ $FAILED == 0 ]] || { say "STOP: the website's own checks failed before the bingo install"; exit 1; }
}

# The website's checks and an unchanged website after a bingo step.
website_unchanged() {
  probe website_checks
  probe ok "nothing of the website changed $1" test "$(website_print)" = "$WEBSITE_PRINT"
}

phases() {
  prepare_matches
  browser_image
  probe browser P1
  admin join "${WATCHERS[0]}" "$(state_value play)" >/dev/null
  admin start admin "$(state_value play)" >/dev/null
  probe ok "the member's match was played to its end" test "$(admin draw-to-end admin "$(state_value play)")" = finished
  admin grant "$(state_value member)" true
  probe browser P2
  admin lock "$(state_value member)" true
  probe browser P3
  admin lock "$(state_value member)" false
  probe browser P4
  admin delete "$(state_value member)"
  probe browser P5
  for code in "$(state_value watch)" "$(state_value hosted)"; do [[ -z $code ]] || admin abort admin "$code" >/dev/null || true; done
}

state_value() { jq -r ".$1 // empty" "$STATE/state.json"; }

main_rehearsal() {
  # RESUME=1 (with KEEP=1 the run before): the kept server and its website, the bingo again.
  if [[ ${RESUME:-0} == 1 ]]; then say "=== resuming on the kept server (website $WEB_SHA)"; else website_install; fi
  WEBSITE_PRINT=$(website_print)
  copy_bingo
  probe bingo_install
  website_unchanged "by the bingo install (except its route file)"
  probe phases
  say "--- a bingo re-run"
  probe ok "a re-run succeeds unattended" on_server bash /root/sbr/ops/install.sh --yes
  website_unchanged "by the re-run"
  say "--- sbr update"
  probe ok "sbr update master" on_server sbr --yes update master
  probe ok "sbr confirm" on_server sbr --yes confirm
  probe bingo_status
  website_unchanged "by the update"
  say "--- sbr uninstall"
  probe ok "sbr uninstall" on_server sbr --yes uninstall
  probe ok "the route file is gone" on_server test ! -e "$(route_file)"
  website_unchanged "by the uninstall"
  say "website: $WEB_SHA ($WEB_REF); mode $MODE; results: $RESULTS"
  if [[ $FAILED == 1 ]]; then say "real-site rehearsal ($MODE): FAILED"; exit 1; fi
  say "real-site rehearsal ($MODE): all checks passed"
}

main_rehearsal
