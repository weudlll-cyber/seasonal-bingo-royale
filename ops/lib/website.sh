#!/usr/bin/env bash
# @file   ops/lib/website.sh
# @module ops
# @brief  Website installs: find the running Seasonal Entertainment website, write the Caddy snippet.
#
# Responsibility: find the website's Caddy (compose project "seasonal-site", service
#                 "caddy", as its docs/DEPLOYMENT.md sets it up in deploy/site/) and from it
#                 the Docker network (seasonal-site_default, else its only one, else asked),
#                 that network's subnet as the trusted proxy range and the website's domain
#                 (SITE_DOMAIN); stop with a plain message when the website is not running.
#                 Write the snippet that routes /games/bingo/* (HTTP and WebSocket) to the
#                 app and print how to add it to the website's Caddyfile. The installer never
#                 edits the website's files.
# Used by:        ops/install.sh, ops/sbr (status)
# Spec:           docs/spec/09-deployment-architecture.md §1, §8

WEBSITE_PROJECT=seasonal-site

website_caddy() {
  docker ps --filter "label=com.docker.compose.project=$WEBSITE_PROJECT" \
    --filter label=com.docker.compose.service=caddy --format '{{.Names}}' | head -1
}

network_subnet() { docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$1" | awk '{ print $1 }'; }

# choose_network <caddy>: the compose default network of the website when Caddy is on it,
# else its only network; with several, ask (or --website-network in unattended runs).
choose_network() {
  local caddy=$1 networks
  networks=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$caddy")
  if [[ -n ${SBR_WEBSITE_NETWORK:-} ]]; then
    [[ " $networks " == *" $SBR_WEBSITE_NETWORK "* ]] || die "the website's Caddy is not on the network $SBR_WEBSITE_NETWORK (it is on: $networks)"
  elif [[ " $networks " == *" ${WEBSITE_PROJECT}_default "* ]]; then
    SBR_WEBSITE_NETWORK=${WEBSITE_PROJECT}_default
  elif [[ $(wc -w <<<"$networks") -eq 1 ]]; then
    SBR_WEBSITE_NETWORK=${networks// /}
  else
    ask SBR_WEBSITE_NETWORK "The website's Caddy is on several networks ($networks): which one should bingo join?"
  fi
}

# detect_website: sets SBR_WEBSITE_NETWORK, SBR_TRUSTED_PROXIES and (unless given)
# SBR_WEBSITE_DOMAIN, or stops.
detect_website() {
  local caddy
  caddy=$(website_caddy)
  if [[ -z $caddy ]]; then
    die "the Seasonal Entertainment website is not running on this server (no Caddy container of the compose project \"$WEBSITE_PROJECT\"). Install the website first (its docs/DEPLOYMENT.md), then run this installer again with --type website."
  fi
  choose_network "$caddy"
  # The whole network's range: Caddy keeps working for the app after it is recreated.
  SBR_TRUSTED_PROXIES=$(network_subnet "$SBR_WEBSITE_NETWORK")
  if [[ -z ${SBR_WEBSITE_DOMAIN:-} ]]; then
    SBR_WEBSITE_DOMAIN=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$caddy" | sed -n 's/^SITE_DOMAIN=//p')
  fi
  ask SBR_WEBSITE_DOMAIN "The website's domain (e.g. example.org)"
  info "  website: Caddy $caddy on network $SBR_WEBSITE_NETWORK ($SBR_TRUSTED_PROXIES), domain $SBR_WEBSITE_DOMAIN"
}

# write_snippet <env>: the route for the website's Caddyfile (snippet_steps says how to add it).
write_snippet() {
  local env=$1 target="$SBR_ROOT/website-bingo.caddy"
  put_file "$target" 0644 <<EOF
# Seasonal Bingo Royale under /games/bingo (written by ops/install.sh, environment $env).
# Belongs inside the website's {\$SITE_DOMAIN} block: before its catch-all reverse_proxy,
# Caddy runs "handle" first, so these paths go to the bingo app, the rest to the site.
redir /games/bingo /games/bingo/ 308
# Metrics stay inside the server (the app refuses proxied requests to them as well).
@sbr_metrics path /games/bingo/metrics /games/bingo/metrics/*
respond @sbr_metrics 404
handle /games/bingo/* {
	# HTTP and the WebSocket upgrade; the app keeps the /games/bingo prefix (SBR_BASE_PATH).
	reverse_proxy sbr-bingo-$env:3000
}
EOF
}

# snippet_steps: how to add the snippet to the website's Caddy (printed at the end).
snippet_steps() {
  local target="$SBR_ROOT/website-bingo.caddy"
  cat <<EOF
Add bingo to the website's Caddy (once, on this server):
     a. In the website checkout, create deploy/site/routes/ and copy $target into it as bingo.caddy.
     b. In deploy/site/Caddyfile, inside the {\$SITE_DOMAIN} { … } block, add the line:
          import /etc/caddy/routes/*.caddy
     c. In deploy/site/docker-compose.yml, give the caddy service the volume:
          - ./routes:/etc/caddy/routes:ro
     d. Apply it:  cd <website checkout>/deploy/site && docker compose up -d caddy
        (a later change to bingo.caddy only needs:  docker exec $(website_caddy) caddy reload --config /etc/caddy/Caddyfile)
     Then open https://$SBR_WEBSITE_DOMAIN/games/bingo/
EOF
}
