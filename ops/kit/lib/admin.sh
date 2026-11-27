#!/usr/bin/env bash
# @file   ops/lib/admin.sh
# @module ops
# @brief  The admin command every game shares: the same verbs with the same meaning and output.
#
# Responsibility: sourced by a game's own command (ops/sbr, ops/smg, …), which sets the SK_ADMIN_*
#                 settings, defines its hooks and ends with `sk_admin_main "$@"`
#                 (docs/OPERATIONS.md, "The admin command"). The verbs: status, update, confirm,
#                 rollback, backup, restore, logs, uninstall; any other word runs the game's
#                 `game_cmd_<word>`. Global options, anywhere: `--env <name>`, `--yes`. Messages:
#                 plain lines, `WARNING: …`, and `STOP: …` with exit 1; an unknown verb prints the
#                 usage and exits 2. Root only. status reads and never changes; it exits 0 also
#                 when the app is not ready. backup and restore are ./../backup.sh with the
#                 settings of the game's `game_backup_settings`; with SK_ADMIN_SECRETS_DIR set, a
#                 restore puts the backup's secret files there (since v0.34.0), and without
#                 --force-env stops, before anything changes, where one differs. status and the
#                 other read-only verbs write nothing: `game_backup_settings` only sets
#                 variables. Secret files are written by the optional `game_backup_secrets`
#                 (since v0.36.0), before a backup, an update's and a rollback's included, and
#                 (since v0.39.0) before a restore compares them. update, confirm and rollback
#                 are ./admin-update.sh, uninstall ./admin-uninstall.sh. No secret is printed.
# Depends on:     bash 4, docker, systemctl, ./admin-update.sh, ./admin-uninstall.sh, ../backup.sh
# Source:         seasonal-bingo-royale ops/sbr and ops/lib/common.sh at d7d841e (the verbs, their
#                 output, the confirmations, the restart of a stopped app). Generalised: the
#                 game's names are settings, its compose call and extras are hooks.
# Spec:           kit DECISIONS K87; docs/concepts/shared-ops-parts.md a

set -euo pipefail
# Errors inside $(…) stop the script too.
shopt -s inherit_errexit

SK_ADMIN_LIB=${BASH_SOURCE[0]%/*}
SK_ADMIN_BACKUP=${SK_ADMIN_BACKUP:-$SK_ADMIN_LIB/../backup.sh}
SK_ADMIN_YES=0
# The environment whose app a restore or rollback stopped, until it runs again.
SK_ADMIN_STOPPED=''
# What state the data is in while it is stopped, for the message of a failure.
SK_ADMIN_DATA=''

info() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() {
  printf 'STOP: %s\n' "$*" >&2
  exit 1
}

# A script that stopped the app and then fails starts it again.
sk_admin_cleanup() {
  local status=$?
  if ((status != 0)) && [[ -n $SK_ADMIN_STOPPED ]]; then
    warn "stopped with an error${SK_ADMIN_DATA:+ ($SK_ADMIN_DATA)}: starting the app of $SK_ADMIN_STOPPED again"
    game_compose "$SK_ADMIN_STOPPED" start "$(sk_admin_app)" ||
      warn "the app did not start: $SK_ADMIN_NAME status, $SK_ADMIN_NAME logs"
  fi
}

sk_admin_app() { printf '%s' "${SK_ADMIN_APP_SERVICE:-app}"; }
sk_admin_env_file() { printf '%s/%s.env' "$SK_ADMIN_ETC" "$1"; }
sk_admin_has() { declare -F "$1" >/dev/null; }
sk_admin_hook() { sk_admin_has "$1" || die "this game's command defines no $1 (docs/OPERATIONS.md)"; }

# The value of a key in an env file without its quotes, or nothing (also without a file).
sk_admin_value() {
  [[ -f $1 ]] || return 0
  sed -n "s/^$2=//p" "$1" | head -n 1 | sed -E "s/^'(.*)'\$/\1/"
}

# sk_admin_set <file> <key> <value>: replaces the key's line, single-quoted, in one rename.
sk_admin_set() {
  local temp
  [[ $3 != *"'"* ]] || die "$2 must not contain a single quote (')"
  temp=$(mktemp "$1.XXXXXX")
  chmod 0600 "$temp"
  { if [[ -f $1 ]]; then sed "/^$2=/d" "$1"; fi; printf "%s='%s'\n" "$2" "$3"; } >"$temp"
  mv "$temp" "$1"
}

# confirm <question>: goes on after "yes" (or --yes), stops otherwise.
sk_admin_confirm() {
  local answer=''
  [[ $SK_ADMIN_YES == 1 ]] && return 0
  printf '%s Type yes to go on: ' "$1"
  read -r answer || true
  [[ $answer == yes ]] || die "stopped; nothing changed"
}

sk_admin_ready() {
  game_compose "$1" exec -T "$(sk_admin_app)" \
    wget -qO- "${SK_ADMIN_READY_URL:-http://127.0.0.1:3000/readyz}" >/dev/null 2>&1
}

# Waits up to 3 minutes for the app's /readyz inside its container.
sk_admin_wait_ready() {
  local i tries=${SK_ADMIN_WAIT_TRIES:-90}
  for ((i = 1; i <= tries; i++)); do
    if sk_admin_ready "$1"; then
      info "  the app is ready (after ${i}x2 s)"
      return 0
    fi
    sleep 2
  done
  die "the app did not become ready within $((tries * 2)) s ($SK_ADMIN_NAME logs)"
}

sk_admin_usage() {
  cat <<EOF
usage: $SK_ADMIN_NAME [--env <name>] [--yes] <command>
  status                         what runs, its health and the last backup
  update <git ref>               build the ref, back up, restart; refused until the last update
                                 is confirmed or rolled back
  confirm                        the update works: delete the pre-update dump and rollback data
  rollback                       back to the image (and data) before the last update
  backup                         encrypted backup now
  restore <file> [--identity k]  put a backup back (k: your age key file;
          [--force-env]          --force-env: another environment's backup or secret, as on a
                                 new server with keys of its own)
  restore --drill <file> [...]   restore into a throw-away database and check it
  logs [service]                 follow the logs
  uninstall [--purge-backups]    remove this environment (asks for its name); backups stay
EOF
  if sk_admin_has game_usage; then game_usage; fi
}

# The newest backup's path, or nothing.
sk_admin_last_backup() {
  (
    game_backup_settings "$1"
    [[ -d ${SK_BACKUP_DIR:-} ]] || exit 0
    # The names carry the time, so the last in name order is the newest.
    find "$SK_BACKUP_DIR" -maxdepth 1 -name "$SK_BACKUP_PREFIX-$1-*.tar.age" | sort | tail -n 1
  )
}

sk_admin_status() {
  local env=$1 file last unit="$SK_ADMIN_PREFIX-backup@$1"
  file=$(sk_admin_env_file "$env")
  info "environment: $env"
  info "image:       $(sk_admin_value "$file" "$SK_ADMIN_IMAGE_KEY") (ref $(sk_admin_value "$SK_ADMIN_ETC/install.conf" "$SK_ADMIN_REF_KEY"))"
  game_compose "$env" ps --format 'table {{.Service}}\t{{.Status}}'
  if sk_admin_ready "$env"; then
    info "health:      ready"
  else
    info "health:      NOT READY ($SK_ADMIN_NAME logs $(sk_admin_app))"
  fi
  last=$(sk_admin_last_backup "$env")
  info "last backup: ${last:-none yet}"
  if systemctl is-failed --quiet "$unit.service" 2>/dev/null; then
    warn "the scheduled backup FAILED (journalctl -u $unit)"
  fi
  info "next backup: $(systemctl show "$unit.timer" -p NextElapseUSecRealtime --value 2>/dev/null || echo unknown)"
  if [[ -f $SK_ADMIN_STATE/$env/rollback.conf ]]; then
    info "rollback:    possible ($SK_ADMIN_NAME confirm deletes the pre-update dump)"
  fi
  if sk_admin_has game_status; then game_status "$env"; fi
}

# The kit's backup script with the game's settings.
sk_admin_script() {
  local env=$1
  shift
  (
    game_backup_settings "$env"
    # A backup carries the secret files and a restore compares against them: both have the game
    # write them as they are now, never a stale or missing set. No other verb writes them.
    if [[ $1 == backup || $1 == restore ]] && sk_admin_has game_backup_secrets; then
      game_backup_secrets "$env"
    fi
    # A restore puts the backup's secret files where the game keeps them, when it says where
    # (a global setting, or the environment's own from game_backup_settings).
    if [[ $1 == restore && -n ${SK_ADMIN_SECRETS_DIR:-} ]]; then
      set -- "$@" --secrets-to "$SK_ADMIN_SECRETS_DIR"
    fi
    bash "$SK_ADMIN_BACKUP" "$@"
  )
}

sk_admin_restore() {
  local env=$1 verb=restore file='' pass=()
  shift
  while (($#)); do
    case $1 in
      --drill) verb=drill ;;
      --identity) pass+=(--identity "${2:?--identity needs a file}"); shift ;;
      --force-env) pass+=(--force-env) ;;
      -*) die "unknown option $1" ;;
      *) file=$1 ;;
    esac
    shift
  done
  [[ -f $file ]] ||
    die "usage: $SK_ADMIN_NAME restore [--drill] <file> [--identity <age key file>] [--force-env]"
  [[ $verb != restore || $SK_ADMIN_YES != 1 ]] || pass+=(--yes)
  sk_admin_script "$env" "$verb" "$file" "${pass[@]}"
}

# Every setting is there; the folders are real folders of their own, so nothing can remove "/".
sk_admin_settings() {
  local name
  for name in NAME PREFIX ETC STATE ROOT IMAGE_REPO IMAGE_KEY REF_KEY; do
    name=SK_ADMIN_$name
    [[ -n ${!name:-} ]] || die "$name is not set (docs/OPERATIONS.md)"
  done
  for name in SK_ADMIN_ETC SK_ADMIN_STATE SK_ADMIN_ROOT; do
    sk_admin_folder "${!name}" || die "$name is not a folder of its own: it needs two names, like /etc/game"
  done
  sk_admin_hook game_compose
  sk_admin_hook game_backup_settings
}

sk_admin_folder() { [[ $1 =~ ^(/[A-Za-z0-9._-]+){2,}/?$ && $1 != *..* ]]; }

sk_admin_run() {
  local env=$1 command=$2
  shift 2
  case $command in
    status) sk_admin_status "$env" ;;
    update) sk_admin_update "$env" "$@" ;;
    confirm) sk_admin_confirm_update "$env" ;;
    rollback) sk_admin_rollback "$env" ;;
    backup) sk_admin_script "$env" backup ;;
    restore) sk_admin_restore "$env" "$@" ;;
    logs) game_compose "$env" logs -f --tail=200 "$@" ;;
    uninstall) sk_admin_uninstall "$env" "$@" ;;
    *)
      if [[ $command =~ ^[a-z][a-z0-9_]*$ ]] && sk_admin_has "game_cmd_$command"; then
        "game_cmd_$command" "$env" "$@"
      else
        sk_admin_usage
        exit 2
      fi
      ;;
  esac
}

# sk_admin_main "$@": SK_ADMIN_DEFAULT_ENV is the environment used without --env.
sk_admin_main() {
  local env=${SK_ADMIN_DEFAULT_ENV:-} args=()
  # The global options may stand anywhere; the rest goes to the command.
  while (($#)); do
    case $1 in
      --env) env=${2:?--env needs a name}; shift ;;
      --yes) SK_ADMIN_YES=1 ;;
      *) args+=("$1") ;;
    esac
    shift
  done
  sk_admin_settings
  set -- "${args[@]}"
  if (($# == 0)); then
    sk_admin_usage
    exit 2
  fi
  [[ $EUID -eq 0 ]] || die "run as root: sudo $SK_ADMIN_NAME $*"
  # A plain name: it becomes part of file and folder names.
  [[ $env =~ ^[a-z][a-z0-9-]*$ && -f $(sk_admin_env_file "$env") ]] ||
    die "no installation of the environment '$env' found (run ops/install.sh first, or pass --env)"
  trap sk_admin_cleanup EXIT
  sk_admin_run "$env" "$@"
}

# shellcheck source=SCRIPTDIR/admin-update.sh
source "$SK_ADMIN_LIB/admin-update.sh"
# shellcheck source=SCRIPTDIR/admin-uninstall.sh
source "$SK_ADMIN_LIB/admin-uninstall.sh"
