#!/usr/bin/env bash
# @file   ops/lib/uninstall.sh
# @module ops
# @brief  sbr uninstall: removes one environment of the game and nothing else.
#
# Responsibility: after the operator types the environment's name (or --yes): stop and remove
#                 the Compose project sbr-<env> with its volumes, its backup timer, the game's own
#                 route file (nginx mode: <routes dir>/bingo.conf, then nginx -t and a reload;
#                 own-Caddy mode: /opt/sbr/routes/bingo.caddy and a note for the website's copy),
#                 its env file and state; with the last environment also the sbr-app images, the
#                 unit files, /opt/sbr and the sbr command. Backups stay unless --purge-backups.
#                 Never touches another Compose project, the website or its files.
# Depends on:     ./common.sh (compose, env_value, confirm, info, warn), docker, systemctl
# Used by:        ops/sbr
# Spec:           docs/spec/09-deployment-architecture.md §4

# remove_route <env>: the game's route file for the website, never the website's own files.
remove_route() {
  local file="$SBR_ETC/$1.env" dir
  [[ $(env_value "$file" SBR_INSTALL_TYPE) == website ]] || return 0
  if [[ $(env_value "$file" SBR_WEBSITE_MODE) == nginx ]]; then
    dir=$(env_value "$file" SBR_WEBSITE_ROUTES_DIR)
    rm -f "$dir/bingo.conf"
    info "  removed $dir/bingo.conf"
    if command -v nginx >/dev/null && nginx -t 2>/dev/null; then
      systemctl reload nginx && info "  nginx reloaded (the include line may stay: it matches no file now)"
    else
      warn "nginx -t failed or nginx is missing: check the website's nginx yourself"
    fi
  else
    rm -f "$SBR_ROOT/routes/bingo.caddy"
    warn "remove bingo.caddy from the website checkout's deploy/site/routes/ and reload its Caddy yourself"
  fi
}

cmd_uninstall() {
  local env=$1 purge=0 typed='' others kept="the backups in $SBR_BACKUPS/$1"
  if [[ ${2:-} == --purge-backups ]]; then purge=1 kept='no backups'; fi
  info "This removes the game's environment $env: its containers, its database and uploads (volumes),"
  info "its backup timer, settings and route file. It keeps $kept."
  if [[ ${SBR_YES:-0} != 1 ]]; then
    read -r -p "Type the environment name ($env) to remove it: " typed
    [[ $typed == "$env" ]] || die "nothing removed"
  fi
  compose "$env" down --volumes --remove-orphans
  systemctl disable --now "sbr-backup@$env.timer" 2>/dev/null || true
  remove_route "$env"
  rm -rf "${SBR_STATE:?}/$env"
  if ((purge)); then rm -rf "${SBR_BACKUPS:?}/$env"; fi
  rm -f "$SBR_ETC/$env.env"
  others=$(find "$SBR_ETC" -maxdepth 1 -name '*.env' 2>/dev/null | wc -l)
  if ((others == 0)); then
    docker image ls sbr-app --format '{{.Repository}}:{{.Tag}}' | xargs -r docker image rm >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/sbr-backup@.service /etc/systemd/system/sbr-backup@.timer \
      /etc/systemd/system/sbr-backup-failed@.service /usr/local/bin/sbr
    systemctl daemon-reload
    rm -rf "${SBR_ETC:?}" "${SBR_ROOT:?}"
  fi
  info "Removed environment $env. Kept: Docker itself, the group sbr-backup, any user you made for backups and $kept."
}
