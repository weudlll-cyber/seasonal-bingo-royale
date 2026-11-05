#!/usr/bin/env bash
# @file   ops/lib/uninstall.sh
# @module ops
# @brief  sbr uninstall: removes one environment of the game and nothing else.
#
# Responsibility: after the operator types the environment's name (or --yes): stop and remove
#                 the Compose project sbr-<env> with its volumes, its backup timer, the game's own
#                 route file (nginx mode: <routes dir>/bingo.conf; own-Caddy mode: the copy in the
#                 website's checkout; then nginx -t / caddy validate and a reload, ./websiteApply.sh),
#                 its env file and state; with the last environment also the sbr-app images, the
#                 unit files, /opt/sbr and the sbr command. Backups stay unless --purge-backups.
#                 Never touches another Compose project, the website or its files.
# Depends on:     ./common.sh (compose, env_value, confirm, info, warn), ./websiteApply.sh, docker, systemctl
# Used by:        ops/sbr
# Spec:           docs/spec/09-deployment-architecture.md §4

# remove_route <env>: the game's route file for the website (./websiteApply.sh), never the
# website's own files; nginx -t / caddy validate stay green.
remove_route() {
  [[ $(env_value "$SBR_ETC/$1.env" SBR_INSTALL_TYPE) == website ]] || return 0
  remove_route_file "$1"
  info "  removed the game's route file and reloaded the website's proxy"
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
