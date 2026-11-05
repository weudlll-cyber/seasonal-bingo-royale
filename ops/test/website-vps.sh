#!/usr/bin/env bash
# @file   ops/test/website-vps.sh
# @module ops/test
# @brief  The website install (D37) in a disposable Ubuntu 24.04 "VPS", in nginx or own-Caddy mode.
#
# Responsibility: as the WP-27 test did: a throw-away Ubuntu 24.04 container with systemd and
#                 its own Docker (privileged, own volumes, no host port, the repository mounted
#                 read-only at /src). It runs a stand-in website (./stub-website.py as the
#                 "site" container of compose project "seasonal-site", behind host nginx on the
#                 port in /etc/seasonal/site-local-port, or behind that project's Caddy), with
#                 the website's games-sync-token, runs
#                 `ops/install.sh --type website` from /src for the given git ref, activates the
#                 game's route file the way the printed steps say, and checks through the
#                 website's proxy: health, the sign-in route sending a visitor the website
#                 answers as a guest through the game's login hop to the website's login with the
#                 wanted page (D43), a website user signed in with name, may-host and Discord
#                 steps and sent back to that page (the authorize call got the method, origin and
#                 cookie), a member without may-host not hosting, a website admin as game admin
#                 (D41), browser-sent identity headers changing nothing (on another route, on the
#                 sign-in route, and sent to the app directly past the proxy without the secret;
#                 in nginx mode the website's network refused even with the secret), the secret
#                 neither printed nor sent to the website, the route file 0600,
#                 /games/bingo/metrics 404, the account-changes feed reached over the website's
#                 network with the token (a "rights" change signs a member out), the token in no
#                 log, and `sbr status` naming the sign-in mode, the authorize endpoint's guest
#                 answer (204) and the followed feed.
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

# The website's files (its installer makes them): the sync token, nginx's site port; a short
# feed interval for the test (an operator line of the env file, kept by the installer).
TOKEN=$(openssl rand -hex 32)
vps "install -d -m 0755 /etc/seasonal/routes /etc/sbr && umask 077 && printf '%s\n' $TOKEN >/etc/seasonal/games-sync-token   && printf '3801\n' >/etc/seasonal/site-local-port && chmod 644 /etc/seasonal/site-local-port   && printf 'SBR_WEBSITE_FEED_INTERVAL_MS=3000\n' >/etc/sbr/prod.env"
# The stand-in website: the site container of compose project seasonal-site in both modes
# (nginx reaches it on the host port 3801; own Caddy on its network).
vps 'curl -fsSL https://get.docker.com | sh >/dev/null 2>&1'
PUBLISH="ports: ['127.0.0.1:3801:3800']"
[[ $MODE == caddy ]] && PUBLISH=''
vps "mkdir -p /srv/site/routes && cat >/srv/site/docker-compose.yml <<CONF
name: seasonal-site
services:
  site:
    image: python:3.12-alpine
    environment: { STUB_ID_HEADER: $STUB_HEADER, STUB_SYNC_TOKEN: $TOKEN }
    volumes: ['/src/ops/test/stub-website.py:/stub.py:ro']
    command: ['python3', '/stub.py']
    $PUBLISH
CONF"
if [[ $MODE == nginx ]]; then
  vps 'DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx >/dev/null'
  vps "cat >/etc/nginx/sites-available/default <<'CONF'
server {
    listen 80 default_server;
    server_name example.org;
    include /etc/seasonal/routes/*.conf;
    location / { proxy_pass http://127.0.0.1:3801; }
}
CONF
nginx -t -q && systemctl restart nginx"
else
  vps "cat >/srv/site/Caddyfile <<'CONF'
{
	auto_https off
}
http://{\$SITE_DOMAIN} {
	import /etc/caddy/routes/*.caddy
	reverse_proxy site:3800
}
CONF
cat >>/srv/site/docker-compose.yml <<CONF
  caddy:
    image: caddy:2.10-alpine
    environment: { SITE_DOMAIN: example.org }
    ports: ['80:80']
    volumes: ['./Caddyfile:/etc/caddy/Caddyfile:ro', './routes:/etc/caddy/routes:ro']
CONF
touch /srv/site/routes/empty.caddy"
fi
vps 'cd /srv/site && docker compose up -d --quiet-pull 2>/dev/null'
# What the stand-in website saw (its /stub/feed answer), from inside its own network.
seen() { vps "docker exec seasonal-site-site-1 wget -qO- http://127.0.0.1:3800/stub/$1"; }

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
FORGED='-H X-Acting-User-Id:1 -H X-Acting-User:Walter -H X-Acting-User-Roles:admin -H X-Acting-User-Email-Verified:true -H X-Acting-User-Can-Host:true -H X-Acting-Guest:false'
check "the app answers through the proxy" "$(vps "curl -s $H $URL/healthz")" 'ok'
# The proxy secret: made by the installer, never printed, only in 0600 files.
secret=$(vps '. /etc/sbr/prod.env && printf %s "$SBR_WEBSITE_PROXY_SECRET"')
check "the installer made a proxy secret" "${#secret}" '64'
check "... and did not print it" "$(vps "grep -c '$secret' /root/install.log || true")" '0'
check "the route file is private" "$(vps "stat -c %a $ROUTE_FILE")" '600'
# A visitor the website answers as a guest (204 + X-Acting-Guest): via the game's login hop
# to the website's login with the wanted page (D43), nobody signed in.
PAGE='%2Fgames%2Fbingo%2F%23%2Fmatch%2FABC123'
refused=$(vps "curl -s -o /dev/null -D - $H $FORGED '$URL/auth/website?next=$PAGE'")
check "a guest of the website gets 302 on the sign-in route" "$refused" ' 302'
check "... to the game's login hop with the page" "$refused" "/games/bingo/auth/website/login?next=$PAGE"
check "... and no game session" "$(grep -ci 'sbr_session' <<<"$refused" || true)" '0'
hop=$(vps "curl -s -o /dev/null -D - $H '$URL/auth/website/login?next=$PAGE'")
check "... then to the website's login, back to the sign-in route and the page" "$hop" '/login?next=%2Fgames%2Fbingo%2Fauth%2Fwebsite%3Fnext%3D%252Fgames%252Fbingo%252F%2523%252Fmatch%252FABC123'
jar=$(vps "curl -s -o /dev/null -D - $H -H Origin:https://example.org -b stub_user=1 '$URL/auth/website?next=$PAGE'")
check "a website user is signed in and sent back to the page" "$(tr 'A-Z' 'a-z' <<<"$jar")" 'location: /games/bingo/#/match/abc123'
check "the authorize call got the method, the origin and the cookie" "$(seen feed)" '"method": "GET", "origin": "https://example.org", "cookie": "stub_user=1"'
cookie=$(cookie_of "$jar")
session=$(vps "curl -s $H -b '$cookie' $URL/api/v1/session")
check "the session has the website name" "$session" '"displayName":"Walter"'
check "a member the website lets start games may host" "$session" 'match.create'
steps=$(vps "docker exec sbr-prod-postgres-1 psql -U sbr -d sbr -tAc \"SELECT steps FROM sbr.accounts WHERE display_name = 'Walter'\"")
check "... and the Discord steps arrived" "$steps" '"name": "Golden"'
check "forged headers on another route sign nobody in" "$(vps "curl -s $H $FORGED $URL/api/v1/session")" '"signedIn":false'
anna=$(cookie_of "$(vps "curl -s -o /dev/null -D - $H $FORGED -b stub_user=2 $URL/auth/website")")
anna_session=$(vps "curl -s $H -b '$anna' $URL/api/v1/session")
check "browser-sent identity headers change nothing on the sign-in route" "$anna_session" '"displayName":"Anna"'
check "... a member without the right to start games does not host" "$(grep -c match.create <<<"$anna_session" || true)" '0'
admin=$(vps "curl -s -o /dev/null -D - $H -b stub_user=3 $URL/auth/website")
admin_cookie=$(cookie_of "$admin")
check "a website admin is a game admin" "$(vps "curl -s $H -b '$admin_cookie' $URL/api/v1/session")" 'match.abort'
# Past the proxy, as another process on the server would: the right address, no secret; and
# from the website's network with the secret (only nginx's edge network is trusted there).
if [[ $MODE == nginx ]]; then
  direct=$(vps "curl -s -o /dev/null -w '%{http_code}' $FORGED http://127.0.0.1:3900/games/bingo/auth/website")
  from_site=$(vps "docker exec seasonal-site-site-1 wget -q -S -O /dev/null --header X-Acting-User-Id:1 --header X-Acting-User:Walter --header X-Sbr-Proxy-Secret:$secret http://sbr-bingo-prod:3000/games/bingo/auth/website 2>&1 || true")
  check "the sign-in route from the website's network is refused, even with the secret" "$from_site" '403'
else
  WGET_FORGED='--header X-Acting-User-Id:1 --header X-Acting-User:Walter --header X-Acting-User-Roles:admin'
  direct=$(vps "docker exec seasonal-site-caddy-1 wget -q -S -O /dev/null $WGET_FORGED http://sbr-bingo-prod:3000/games/bingo/auth/website 2>&1 || true")
fi
check "forged headers sent to the app directly sign nobody in" "$direct" '403'
check "metrics stay inside" "$(vps "curl -s -o /dev/null -w '%{http_code}' $H $URL/metrics")" '404'
# The account-changes feed over the website's network: a "rights" change signs Walter out.
seen arm >/dev/null
for _ in $(seq 1 20); do
  [[ $(vps "curl -s $H -b '$cookie' $URL/api/v1/session") == *'"signedIn":false'* ]] && break
  sleep 2
done
check "the feed was asked with the token" "$(seen feed)" '"feed_refused": 0'
check "a rights change from the feed ends the member's session" "$(vps "curl -s $H -b '$cookie' $URL/api/v1/session")" '"signedIn":false'
check "the sync token is in no log" "$(vps "{ cat /root/install.log; docker logs sbr-prod-app-1 2>&1; sbr status 2>&1; } | grep -c $TOKEN || true")" '0'
status=$(vps 'sbr status 2>&1')
check "sbr status names the sign-in mode" "$status" 'sign-in:     website'
check "sbr status: the authorize endpoint answers" "$status" 'authorize endpoint'
check "sbr status: a guest answer (204) without a browser session" "$status" ': 204'
check "sbr status: the feed is followed" "$status" "website feed: following the website's account changes"

if [[ $FAILED == 1 ]]; then echo "website install ($MODE): FAILED"; exit 1; fi
echo "website install ($MODE): all checks passed"
