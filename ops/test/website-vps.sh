#!/usr/bin/env bash
# @file   ops/test/website-vps.sh
# @module ops/test
# @brief  The website install (D37) in a disposable Ubuntu 24.04 "VPS", in nginx or own-Caddy mode.
#
# Responsibility: as the WP-27 test did: a throw-away Ubuntu 24.04 container with systemd and
#                 its own Docker (privileged, own volumes, no host port, the repository mounted
#                 read-only at /src). It runs a stand-in website (./stub-website.py behind host
#                 nginx, or behind a Caddy of compose project "seasonal-site"), runs
#                 `ops/install.sh --type website` from /src for the given git ref, activates the
#                 game's route file the way the printed steps say, and checks through the
#                 website's proxy: health, the sign-in route sending a visitor without a website
#                 session through the game's login hop to the website's login with the wanted
#                 page (D43), a website user signed in with name and hosting role and sent back
#                 to that page, a website admin as game admin (D41), forged identity headers
#                 signing nobody in (on another route, on the sign-in route without a website
#                 session, and sent to the app directly, past the proxy, without the proxy
#                 secret), the secret neither printed by the installer nor sent to the website,
#                 the route file 0600, /games/bingo/metrics 404, and `sbr status` naming the
#                 sign-in mode and the authorize endpoint's 401.
#                 --broken-header makes the stand-in send a wrong id header name: the test must
#                 fail. Everything it made is removed at the end (--keep leaves it for a look).
#                 Test only: never part of an install.
# Depends on:     docker (with privileged containers), ./stub-website.py, ../install.sh
# Spec:           docs/spec/09-deployment-architecture.md §3; docs/spec/07-integration-architecture.md §2.3
#
# Usage: bash ops/test/website-vps.sh nginx|caddy <git ref> [--broken-header] [--keep]
set -euo pipefail
export MSYS_NO_PATHCONV=1

MODE=${1:?nginx or caddy}
REF=${2:?the git ref to install}
shift 2
BROKEN=0 KEEP=0
for arg in "$@"; do
  case $arg in
    --broken-header) BROKEN=1 ;;
    --keep) KEEP=1 ;;
    *) echo "unknown option $arg" >&2; exit 2 ;;
  esac
done
# Docker on Windows takes the repository as C:/…; elsewhere the plain path.
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && (pwd -W 2>/dev/null || pwd))
NAME=sbr-wl-$MODE
IMAGE=sbr-wl-vps
FAILED=0

cleanup() {
  [[ $KEEP == 1 ]] && { echo "kept: container $NAME, volumes $NAME-docker $NAME-containerd"; return; }
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$NAME-docker" "$NAME-containerd" >/dev/null 2>&1 || true
}
trap cleanup EXIT

vps() { docker exec "$NAME" bash -c "$1"; }

check() {
  local what=$1 got=$2 want=$3
  if [[ $got == *"$want"* ]]; then
    echo "PASS  $what"
  else
    echo "FAIL  $what: wanted \"$want\", got \"$got\""
    FAILED=1
  fi
}

# The game session cookie ("name=value") in curl -D headers.
cookie_of() { sed -n 's/^[Ss]et-[Cc]ookie: \([^;]*\).*/\1/p' <<<"$1" | head -1; }

# The "VPS": Ubuntu 24.04 with systemd as PID 1 and the installer's own tools.
docker build -q -t "$IMAGE" - <<'EOF' >/dev/null
FROM ubuntu:24.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      systemd systemd-sysv ca-certificates curl git openssl iproute2 python3 sudo \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
CMD ["/sbin/init"]
EOF
docker run -d --name "$NAME" --privileged --cgroupns=host \
  -v "$NAME-docker:/var/lib/docker" -v "$NAME-containerd:/var/lib/containerd" \
  -v "$REPO:/src:ro" "$IMAGE" >/dev/null
for _ in $(seq 1 30); do vps 'systemctl is-system-running 2>/dev/null | grep -qE "running|degraded"' && break; sleep 2; done
vps 'git config --global --add safe.directory "*"'
STUB_HEADER=X-Acting-User-Id
[[ $BROKEN == 1 ]] && STUB_HEADER=X-Acting-User-Ident

# The stand-in website, in the chosen mode.
if [[ $MODE == nginx ]]; then
  vps 'DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx >/dev/null'
  vps "cat >/etc/nginx/sites-available/default <<'CONF'
server {
    listen 80 default_server;
    server_name example.org;
    include /etc/seasonal/routes/*.conf;
    location / { proxy_pass http://127.0.0.1:3800; }
}
CONF
mkdir -p /etc/seasonal/routes && nginx -t -q && systemctl restart nginx"
  vps "systemd-run --unit stub-website --setenv=STUB_ID_HEADER=$STUB_HEADER python3 /src/ops/test/stub-website.py"
else
  vps 'curl -fsSL https://get.docker.com | sh >/dev/null 2>&1'
  vps "mkdir -p /srv/site/routes && cat >/srv/site/Caddyfile <<'CONF'
{
	auto_https off
}
http://{\$SITE_DOMAIN} {
	import /etc/caddy/routes/*.caddy
	reverse_proxy site:3800
}
CONF
cat >/srv/site/docker-compose.yml <<CONF
name: seasonal-site
services:
  site:
    image: python:3.12-alpine
    environment: { STUB_ID_HEADER: $STUB_HEADER }
    volumes: ['/src/ops/test/stub-website.py:/stub.py:ro']
    command: ['python3', '/stub.py']
  caddy:
    image: caddy:2.10-alpine
    environment: { SITE_DOMAIN: example.org }
    ports: ['80:80']
    volumes: ['./Caddyfile:/etc/caddy/Caddyfile:ro', './routes:/etc/caddy/routes:ro']
CONF
touch /srv/site/routes/empty.caddy && cd /srv/site && docker compose up -d --quiet-pull 2>/dev/null"
fi

# The install, as an operator would run it (unattended).
vps "bash /src/ops/install.sh --yes --type website --env prod --website-domain example.org \
  --email admin@example.org --age-key age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq \
  --repo /src --ref $REF >/root/install.log 2>&1; tail -12 /root/install.log"
if [[ $MODE == nginx ]]; then
  ROUTE_FILE=/etc/seasonal/routes/bingo.conf
  vps 'nginx -t -q && systemctl reload nginx'
else
  ROUTE_FILE=/opt/sbr/routes/bingo.caddy
  vps 'cp /opt/sbr/routes/bingo.caddy /srv/site/routes/ && docker exec seasonal-site-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>/dev/null'
fi

# Through the website's proxy, as a browser would.
URL=http://127.0.0.1/games/bingo
H='-H Host:example.org'
FORGED='-H X-Acting-User-Id:u-1 -H X-Acting-User:Walter -H X-Acting-User-Roles:organiser -H X-Acting-User-Email-Verified:true'
check "the app answers through the proxy" "$(vps "curl -s $H $URL/healthz")" 'ok'
# The proxy secret: made by the installer, never printed, only in 0600 files.
secret=$(vps '. /etc/sbr/prod.env && printf %s "$SBR_WEBSITE_PROXY_SECRET"')
check "the installer made a proxy secret" "${#secret}" '64'
check "... and did not print it" "$(vps "grep -c '$secret' /root/install.log || true")" '0'
check "the route file is private" "$(vps "stat -c %a $ROUTE_FILE")" '600'
# Forged headers without a website session: via the game's login hop to the website's login
# with the wanted page (D43), nobody signed in.
PAGE='%2Fgames%2Fbingo%2F%23%2Fmatch%2FABC123'
refused=$(vps "curl -s -o /dev/null -D - $H $FORGED '$URL/auth/website?next=$PAGE'")
check "without a website session the sign-in route answers 302" "$refused" ' 302'
check "... to the game's login hop with the page" "$refused" "/games/bingo/auth/website/login?next=$PAGE"
check "... and sets no game session" "$(grep -ci 'sbr_session' <<<"$refused" || true)" '0'
hop=$(vps "curl -s -o /dev/null -D - $H '$URL/auth/website/login?next=$PAGE'")
check "... then to the website's login, back to the sign-in route and the page" "$hop"   '/login?next=%2Fgames%2Fbingo%2Fauth%2Fwebsite%3Fnext%3D%252Fgames%252Fbingo%252F%2523%252Fmatch%252FABC123'
jar=$(vps "curl -s -o /dev/null -D - $H -b stub_user=u-1 '$URL/auth/website?next=$PAGE'")
check "a website user is signed in and sent back to the page" "$(tr 'A-Z' 'a-z' <<<"$jar")" 'location: /games/bingo/#/match/abc123'
cookie=$(cookie_of "$jar")
session=$(vps "curl -s $H -b '$cookie' $URL/api/v1/session")
check "the session has the website name" "$session" '"displayName":"Walter"'
check "an organiser may host" "$session" 'match.create'
check "forged headers on another route sign nobody in" "$(vps "curl -s $H $FORGED $URL/api/v1/session")" '"signedIn":false'
admin=$(vps "curl -s -o /dev/null -D - $H -b stub_user=u-3 $URL/auth/website")
admin_cookie=$(cookie_of "$admin")
check "a website admin is a game admin" "$(vps "curl -s $H -b '$admin_cookie' $URL/api/v1/session")" 'match.abort'
# Past the proxy, as another process on the server would: the right address, no secret.
if [[ $MODE == nginx ]]; then
  direct=$(vps "curl -s -o /dev/null -w '%{http_code}' $FORGED http://127.0.0.1:3900/games/bingo/auth/website")
else
  WGET_FORGED='--header X-Acting-User-Id:u-1 --header X-Acting-User:Walter --header X-Acting-User-Roles:organiser'
  direct=$(vps "docker exec seasonal-site-caddy-1 wget -q -S -O /dev/null $WGET_FORGED http://sbr-bingo-prod:3000/games/bingo/auth/website 2>&1 || true")
fi
check "forged headers sent to the app directly sign nobody in" "$direct" '403'
check "metrics stay inside" "$(vps "curl -s -o /dev/null -w '%{http_code}' $H $URL/metrics")" '404'
status=$(vps 'sbr status 2>&1')
check "sbr status names the sign-in mode" "$status" 'sign-in:     website'
check "sbr status: the authorize endpoint answers" "$status" 'authorize endpoint'
check "sbr status: 401 without a browser session" "$status" ': 401'

if [[ $FAILED == 1 ]]; then echo "website install ($MODE): FAILED"; exit 1; fi
echo "website install ($MODE): all checks passed"
