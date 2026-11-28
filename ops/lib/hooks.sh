#!/usr/bin/env bash
# @file   ops/lib/hooks.sh
# @module ops
# @brief  What the kit's admin command asks Bingo: its hooks and its own verbs.
#
# Responsibility: the hooks of ../kit/lib/admin.sh: Compose, build (a ref older than the database
#                 roles is refused), the migrations count, the ref's stack files, before the start
#                 (an older install gets its database roles, the env file kept for a rollback; the
#                 roles; the recovery key once, K20; the website's route file), the roles after a
#                 rollback's restore, status lines, usage, the route file for an uninstall; and the
#                 verbs admin, maintenance and loadcheck. The backup's settings: ./backup.sh.
# Depends on:     ./common.sh, ./config.sh, ./website.sh, ./websiteApply.sh, ./loadcheck.sh,
#                 ../kit/lib/admin.sh (sk_admin_confirm), Docker Compose
# Used by:        ops/sbr
# Spec:           docs/spec/09-deployment-architecture.md §4–§6

game_compose() { compose "$@"; }

game_build() {
  local env=$1 ref=$2 file="$SBR_ETC/$1.env"
  # The image first (minutes): the backup then holds the data right before the switch.
  build_image "$(env_value "$SBR_ETC/install.conf" SBR_REPO)" "$ref"
  # An install with the database roles cannot go to a version without them (its app would
  # connect as the app role and fail to migrate); sbr rollback goes back instead.
  if [[ -n $(env_value "$file" SBR_DB_APP_PASSWORD) ]] &&
    ! git -C "$SBR_ROOT/src" cat-file -e "${SBR_IMAGE#sbr-app:}:ops/lib/hooks.sh" 2>/dev/null &&
    ! git -C "$SBR_ROOT/src" cat-file -e "${SBR_IMAGE#sbr-app:}:ops/lib/db-roles.sql" 2>/dev/null; then
    die "$ref is older than the database roles this install uses; it cannot be installed over them"
  fi
  SK_ADMIN_NEW_IMAGE=$SBR_IMAGE
}

game_migrations() {
  compose "$1" exec -T postgres psql -U sbr -d sbr -tA -c 'SELECT count(*) FROM sbr.schema_migrations'
}

# The new version's stack files (limits, routes, this command, the kit's folder).
game_install_stack() {
  git -C "$SBR_ROOT/src" -c advice.detachedHead=false checkout --quiet --force "${SK_ADMIN_NEW_IMAGE#sbr-app:}"
  install_files "$SBR_ROOT/src/ops"
}

game_before_start() {
  local env=$1 file="$SBR_ETC/$1.env" dir="$SBR_STATE/$1"
  # Once, for an install made before the database roles (audit-3 S1): the env file as it was
  # stays for a rollback, then the roles' passwords and URLs; the roles on every update.
  if [[ -z $(env_value "$file" SBR_DB_APP_PASSWORD) ]]; then
    install -m 0600 "$file" "$dir/env.before"
    convert_db_roles "$env"
    info "Database roles: the app now connects as sbr_app, the migrations run as sbr_owner."
  fi
  apply_db_roles "$env"
  # Once, for an install made before the recovery key (K20): recovery codes are stored under it
  # from this version on; the codes stored before keep working (K27).
  if [[ -z $(env_value "$file" SBR_RECOVERY_KEY) ]]; then
    set_env_value "$file" SBR_RECOVERY_KEY "$(secret 32)"
    info "Recovery key: made (SBR_RECOVERY_KEY in $file)."
  fi
  # Website installs: the sync token, nginx's site port and the route file read again.
  refresh_website "$env"
}

# A restored dump belongs to the superuser: give it back to the owner when roles are in use.
game_after_restore() {
  if (($2)) && [[ -n $(env_value "$SBR_ETC/$1.env" SBR_DB_APP_PASSWORD) ]]; then apply_db_roles "$1"; fi
}

game_status() {
  local env=$1 file="$SBR_ETC/$1.env"
  info "type:        $(env_value "$file" SBR_INSTALL_TYPE)"
  info "address:     $(env_value "$file" SBR_PUBLIC_URL)"
  if compose "$env" exec -T app test -f /data/maintenance 2>/dev/null; then
    info "maintenance: ON (no new matches) $(compose "$env" exec -T app cat /data/maintenance 2>/dev/null)"
  else
    info "maintenance: off"
  fi
  info "sign-in:     $(env_value "$file" SBR_AUTH_MODE)"
  # Standalone: password reset needs the SMTP settings (D60).
  if [[ $(env_value "$file" SBR_AUTH_MODE) == local ]]; then
    if [[ -n $(env_value "$file" SBR_SMTP_HOST) ]]; then
      info "mail:        through $(env_value "$file" SBR_SMTP_HOST) (password reset on)"
    else
      warn "no SMTP settings in $file: password reset is off (run the installer again with --smtp-host …)"
    fi
  fi
  if [[ -n $(env_value "$file" SBR_DB_APP_PASSWORD) ]]; then
    info "database:    the app as sbr_app, migrations as sbr_owner"
  else
    warn "database: the app still connects as the superuser; the next sbr update sets up the roles"
  fi
  if [[ $(env_value "$file" SBR_INSTALL_TYPE) == website ]]; then
    check_proxy "$env"
    # Without a browser session: 204 with X-Acting-Guest (an older website: 401, D37).
    info "website:     authorize endpoint $(env_value "$file" SBR_WEBSITE_UPSTREAM)$(env_value "$file" SBR_WEBSITE_AUTHORIZE_PATH): $(authorize_status "$env")"
    feed_state "$env"
  fi
}

game_usage() {
  cat <<'EOF'
  drill <file> --identity <k>    restore --drill, then the backup's seed key against its matches
  rewrite_backup <file> --identity <k>
                                 a backup made before the kit's format, written again as a new one
  admin create-super             create the first admin account (standalone only)
  admin reset-2fa <name>         an admin who lost the authenticator enrols again at the next sign-in
  maintenance on ["reason"]|off  no new matches while on (players see the page and reason)
  loadcheck [--players 200] [--spectators 50] [--minutes 10] [--cpuset CPUS]
                                 one measured royale with temporary accounts (refused while
                                 players play, or are signed in with maintenance off)
EOF
}

# The game's own route file in the website's proxy, for the uninstall; none outside a website
# install, or where the file cannot be reached (game_uninstall_extra then).
game_route_settings() {
  local file="$SBR_ETC/$1.env"
  [[ $(env_value "$file" SBR_INSTALL_TYPE) == website ]] || return 0
  load_route_values "$file"
  if [[ $SBR_WEBSITE_MODE != nginx ]]; then
    [[ -n $(caddy_route_target) && -n $(website_caddy) ]] || return 0
  fi
  route_settings "$1"
}

game_uninstall_extra() { remove_route_leftovers "$1"; }

# admin create-super | admin reset-2fa <name>; --email and --name answer create-super.
game_cmd_admin() {
  local env=$1 email='' name='' tty=() words=()
  shift
  while (($#)); do
    case $1 in
      --email) email=${2:?--email needs an address}; shift ;;
      --name) name=${2:?--name needs a name}; shift ;;
      *) words+=("$1") ;;
    esac
    shift
  done
  [[ -t 0 ]] || tty=(-T)
  # An admin who lost the authenticator and the recovery codes enrols again (D60).
  if [[ ${words[0]:-} == reset-2fa ]]; then
    [[ -n ${words[1]:-} ]] || die "usage: sbr admin reset-2fa <display name>"
    compose "$env" exec "${tty[@]}" app node dist/cli.js reset-2fa --name "${words[1]}"
    return
  fi
  [[ ${words[0]:-} == create-super ]] || die "usage: sbr admin create-super | sbr admin reset-2fa <display name>"
  # Before its questions: the app refuses it in website mode as well (website admins are game
  # admins, D41; no password sign-in there, D37).
  [[ $(env_value "$SBR_ETC/$env.env" SBR_AUTH_MODE) != website ]] ||
    die "not needed in website mode: website admins are game admins (D41), and there is no password sign-in here (D37)"
  ask email "Admin e-mail" "$(env_value "$SBR_ETC/$env.env" SBR_ADMIN_EMAIL)"
  ask name "Admin display name (3–24 letters or digits)" admin
  compose "$env" exec "${tty[@]}" app node dist/cli.js create-super --email "$email" --name "$name"
}

# The flag file's text is the reason players see on the maintenance page (may be empty).
game_cmd_maintenance() {
  case ${2:-} in
    on)
      # The reason travels as an argument, so no quoting in it can break the command.
      # shellcheck disable=SC2016 # $1 expands inside the container's shell
      compose "$1" exec -T app sh -c 'printf "%s" "$1" > /data/maintenance' sh "${3:-}"
      info "maintenance on: no new matches; running ones finish; players see the maintenance page"
      ;;
    off) compose "$1" exec -T app rm -f /data/maintenance && info "maintenance off" ;;
    *) die "usage: sbr maintenance on [\"reason for players\"] | off" ;;
  esac
}

game_cmd_loadcheck() {
  # The load check's own cleanup (its accounts and containers) when it ends, also on failure.
  trap sbr_cleanup EXIT
  cmd_loadcheck "$@"
}
