#!/usr/bin/env bash
# @file   ops/test/real-site-admin.sh
# @module ops/test
# @brief  Inside the rehearsal's server: the real website's accounts and the game's API, by curl.
#
# Responsibility: what a website admin and the website's members do outside the browser in
#                 ./real-site.sh, through https://example.org with the test's Pebble root:
#                 the website's own API (its pre-login, login and registration with the key
#                 the site derives from a password, computed in the site container; the test
#                 admin's 2FA set up on its first login, as the website's own checks do in its
#                 deploy/test/checks-bot-admin.sh), the admin's user actions ("can start games",
#                 lock, unlock, delete), and the game under /games/bingo/ with a member's game
#                 session (signed in through the website's sign-in route): create, join, start,
#                 draw a host-drawn match to its end, abort. Cookie jars and the admin's TOTP
#                 secret stay in /etc/seasonal-test/sbr (mode 700). Test only.
# Depends on:     curl, python3, docker (the site container seasonal-site-site-1)
# Used by:        ./real-site.sh (copied into the server as /etc/seasonal-test/sbr-admin.sh)
# Spec:           docs/spec/07-integration-architecture.md §2; the website's docs/AUTH.md
#
# Usage: sbr-admin.sh <command> [args]   (TEST_ADMIN_PASSWORD in the environment for the admin)
set -euo pipefail

SITE=https://example.org
GAME=$SITE/games/bingo
DIR=/etc/seasonal-test/sbr
ROOT_CA=/etc/seasonal-test/pebble-root.pem
install -d -m 700 "$DIR"

# json PATH: a field of the JSON on stdin (a.b for nested, a.0 for an index), empty when missing.
json() {
  python3 -I -c '
import json, sys
v = json.load(sys.stdin)
for k in sys.argv[1].split("."):
    v = v[int(k)] if isinstance(v, list) else (v or {}).get(k)
print("" if v is None else v)' "$1"
}

# The site's own crypto and TOTP, in its container (as its checks do).
in_site() { docker exec -i -w /app seasonal-site-site-1 node --input-type=module -e "$@"; }
new_salt() { in_site "import { newSalt } from '@seasonal-entertainment/shared/crypto.js'; console.log(await newSalt());"; }
auth_key() {
  in_site "import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';
    let password = ''; for await (const chunk of process.stdin) password += chunk;
    console.log((await deriveAccountKeys(password, process.argv[1])).authKey);" "$1"
}
totp() {
  in_site "import { codeForStep, stepAt } from '/app/server/src/twofa/totp.js';
    console.log(codeForStep(process.argv[1], stepAt(Date.now())));" "$(cat "$DIR/admin-totp")"
}

# site JAR METHOD PATH [JSON]: the website's API as its pages call it.
site() {
  local data=()
  [[ -z ${4:-} ]] || data=(--data "$4")
  curl -sS --max-time 30 --cacert "$ROOT_CA" -b "$1" -c "$1" -X "$2" -H 'Content-Type: application/json' \
    -H "Origin: $SITE" "${data[@]}" "$SITE/api$3"
}

# login NAME PASSWORD: a fresh website session in $DIR/NAME.jar (the admin's code when asked).
login() {
  local jar=$DIR/$1.jar salt key answer
  rm -f "$jar"
  salt=$(site "$jar" POST /auth/prelogin "{\"username\":\"$1\"}" | json salt)
  key=$(printf '%s' "$2" | auth_key "$salt")
  answer=$(site "$jar" POST /auth/login "{\"username\":\"$1\",\"authKey\":\"$key\"}")
  if [[ $(json twoFactorRequired <<<"$answer") == True ]]; then
    answer=$(site "$jar" POST /2fa/login "{\"code\":\"$(totp)\"}")
  fi
  [[ $(json ok <<<"$answer") == True ]] || { echo "login $1 failed: $answer" >&2; exit 1; }
  AUTH_KEY=$key
}

# The test admin: 2FA set up on the first login (every staff action needs it). A session still
# open is kept: a TOTP code is taken once, so two logins in one 30-second step would fail.
admin_login() {
  local secret answer
  [[ $(site "$DIR/admin.jar" GET /auth/session 2>/dev/null | json user.username) != admin ]] || return 0
  login admin "${TEST_ADMIN_PASSWORD:?the test admin password}"
  [[ ! -s $DIR/admin-totp ]] || return 0
  secret=$(site "$DIR/admin.jar" POST /2fa/setup "{\"authKey\":\"$AUTH_KEY\"}" | json secret)
  (umask 077 && echo "$secret" >"$DIR/admin-totp")
  answer=$(site "$DIR/admin.jar" POST /2fa/enable "{\"code\":\"$(totp)\"}")
  [[ $(json ok <<<"$answer") == True ]] || { echo "2FA enable failed: $answer" >&2; exit 1; }
}

register() {
  local salt key answer
  salt=$(new_salt)
  key=$(printf '%s' "$2" | auth_key "$salt")
  answer=$(site "$DIR/$1.jar" POST /auth/register \
    "{\"username\":\"$1\",\"email\":\"$1@example.org\",\"salt\":\"$salt\",\"authKey\":\"$key\",\"ageConfirmed\":true}")
  [[ $(json ok <<<"$answer") == True ]] || { echo "register $1 failed: $answer" >&2; exit 1; }
}

user_id() {
  site "$DIR/admin.jar" GET "/admin/users?q=$1" | python3 -I -c '
import json, sys
print(next(u["id"] for u in json.load(sys.stdin)["users"] if u["username"] == sys.argv[1]))' "$1"
}

# admin_action NAME METHOD SUFFIX [JSON]: one of the admin's actions on NAME's account
# (/api/admin/users/<id><SUFFIX>); its answer must be ok.
admin_action() {
  local id answer
  admin_login
  id=$(user_id "$1")
  answer=$(site "$DIR/admin.jar" "$2" "/admin/users/$id$3" "${4:-}")
  [[ $(json ok <<<"$answer") == True ]] || { echo "admin $2 $3 on $1 failed: $answer" >&2; exit 1; }
}

# game NAME METHOD PATH [JSON]: the game's API with NAME's game session and CSRF token.
game() {
  local jar=$DIR/$1.jar csrf data=()
  csrf=$(curl -sS --cacert "$ROOT_CA" -b "$jar" -c "$jar" "$GAME/api/v1/session" | json csrfToken)
  [[ -z ${4:-} ]] || data=(--data "$4")
  curl -sS --max-time 30 --cacert "$ROOT_CA" -b "$jar" -c "$jar" -X "$2" -H 'Content-Type: application/json' \
    -H "Origin: $SITE" -H "x-csrf-token: $csrf" "${data[@]}" "$GAME/api/v1$3"
}

# The game's sign-in route with the website session in the same jar (the website's proxy asks it).
game_signin() {
  curl -sS -o /dev/null --cacert "$ROOT_CA" -b "$DIR/$1.jar" -c "$DIR/$1.jar" -H "Origin: $SITE" \
    "$GAME/auth/website?next=%2Fgames%2Fbingo%2F"
}

# draw NAME CODE: host draws until the match is over (a draw is refused while its window runs).
draw_to_end() {
  local status
  for _ in $(seq 1 600); do
    status=$(game "$1" GET "/matches/$2" | json status)
    [[ $status == running ]] || { echo "$status"; return 0; }
    game "$1" POST "/matches/$2/draw-next" '{}' >/dev/null
    sleep 1
  done
  echo "still running"
}

command=${1:?command}
shift
case $command in
  admin-login) admin_login && game_signin admin ;;
  register) register "$1" "$2" ;;
  signin) login "$1" "$2" && game_signin "$1" ;;
  grant) admin_action "$1" POST /can-start-games "{\"value\":$2}" ;;
  lock) admin_action "$1" POST /lock "{\"locked\":$2}" ;;
  delete) admin_action "$1" DELETE '' ;;
  create) game "$1" POST /matches "$2" | json code ;;
  join | start) game "$1" POST "/matches/$2/$command" '{}' ;;
  abort) game "$1" POST "/matches/$2/abort" '{"reason":"test cleanup"}' ;;
  status) game "$1" GET "/matches/$2" | json status ;;
  draw-to-end) draw_to_end "$1" "$2" ;;
  session) game "$1" GET /session ;;
  *) echo "unknown command $command" >&2; exit 2 ;;
esac
