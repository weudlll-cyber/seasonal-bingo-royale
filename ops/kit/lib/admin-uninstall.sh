#!/usr/bin/env bash
# @file   ops/lib/admin-uninstall.sh
# @module ops
# @brief  uninstall of the shared admin command: one environment of one game, and nothing else.
#
# Responsibility: sourced by ./admin.sh. After the operator types the environment's name (or
#                 --yes): the game's Compose project of that environment with its volumes, its
#                 backup timer, its route file in the website's proxy (`game_route_settings` names
#                 it; the proxy is checked, then reloaded), its rollback data and its settings
#                 file; with `game_uninstall_extra` what only the game knows. With the game's last
#                 environment also its images, its backup units, its command and its folders.
#                 The backups stay unless --purge-backups is given: a backup cannot be made again.
#                 Any other option stops before anything is removed. Never touches another
#                 project, another environment, the website or Docker itself.
# Depends on:     ./admin.sh, ./website-route.sh (sk_route_remove), docker, systemctl
# Source:         seasonal-bingo-royale ops/lib/uninstall.sh and ops/lib/websiteApply.sh
#                 (`remove_route_file`) at d7d841e. Changed: an unknown option stops instead of
#                 being ignored.
# Spec:           kit DECISIONS K87

# The environment's route file out of the website's proxy, if the game names one.
sk_admin_remove_route() {
  sk_admin_has game_route_settings || return 0
  (
    SK_ROUTE_FILE=''
    game_route_settings "$1"
    [[ -n $SK_ROUTE_FILE ]] || exit 0
    # shellcheck source=SCRIPTDIR/website-route.sh
    source "$SK_ADMIN_LIB/website-route.sh"
    sk_route_remove
  )
}

# What the game's last environment leaves behind.
sk_admin_remove_game() {
  local units=${SK_ADMIN_UNIT_DIR:-/etc/systemd/system} command=${SK_ADMIN_COMMAND:-/usr/local/bin/$SK_ADMIN_NAME}
  local image
  for image in $(docker image ls "$SK_ADMIN_IMAGE_REPO" --format '{{.Repository}}:{{.Tag}}'); do
    docker image rm "$image" >/dev/null 2>&1 || true
  done
  rm -f "$units/$SK_ADMIN_PREFIX-backup@.service" "$units/$SK_ADMIN_PREFIX-backup@.timer" \
    "$units/$SK_ADMIN_PREFIX-backup-failed@.service" "$command"
  systemctl daemon-reload
  rm -rf "${SK_ADMIN_STATE:?}" "${SK_ADMIN_ETC:?}" "${SK_ADMIN_ROOT:?}"
}

sk_admin_uninstall() {
  local env=$1 purge=0 typed='' backups kept left
  shift
  while (($#)); do
    case $1 in
      --purge-backups) purge=1 ;;
      *) die "unknown option $1: nothing removed" ;;
    esac
    shift
  done
  backups=$(
    game_backup_settings "$env"
    printf '%s' "${SK_BACKUP_DIR:-}"
  )
  if ((purge)); then
    sk_admin_folder "$backups" || die "the backup folder '$backups' is not a folder of its own: nothing removed"
    kept='no backups'
  else
    kept="the backups in ${backups:-their folder}"
  fi
  info "This removes the environment $env of $SK_ADMIN_NAME: its containers, its database and uploads"
  info "(volumes), its backup timer, settings and route file. It keeps $kept."
  if [[ $SK_ADMIN_YES != 1 ]]; then
    printf 'Type the environment name (%s) to remove it: ' "$env"
    read -r typed || true
    [[ $typed == "$env" ]] || die "nothing removed"
  fi
  game_compose "$env" down --volumes --remove-orphans
  systemctl disable --now "$SK_ADMIN_PREFIX-backup@$env.timer" 2>/dev/null || true
  sk_admin_remove_route "$env"
  if sk_admin_has game_uninstall_extra; then game_uninstall_extra "$env"; fi
  rm -rf "${SK_ADMIN_STATE:?}/${env:?}"
  if ((purge)); then rm -rf "${backups:?}"; fi
  rm -f "$(sk_admin_env_file "$env")"
  left=$(find "$SK_ADMIN_ETC" -maxdepth 1 -name '*.env' | wc -l)
  ((left > 0)) || sk_admin_remove_game
  info "Removed environment $env. Kept: Docker itself, any group or user you made for backups, and $kept."
}
