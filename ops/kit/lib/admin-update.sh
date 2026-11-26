#!/usr/bin/env bash
# @file   ops/lib/admin-update.sh
# @module ops
# @brief  update, confirm and rollback of the shared admin command.
#
# Responsibility: sourced by ./admin.sh. update <ref>: refused while the last update is not
#                 confirmed; the game builds the image first (`game_build`, which sets
#                 SK_ADMIN_NEW_IMAGE), then a backup and a plain pre-update dump hold the data
#                 right before the switch; the rollback data is written; the installed stack files
#                 are kept and the new ones installed (`game_install_stack`); `game_before_start`;
#                 the new image and ref are noted, the stack started and waited for; images no
#                 environment uses are removed. confirm: the dump and rollback data go. rollback:
#                 asks; backs up; restores the dump in one transaction only if the schema migrated
#                 (`game_migrations` counts), with the app stopped; puts back the settings file the
#                 update kept (env.before), the image, ref and stack files; starts and waits.
# Depends on:     ./admin.sh, ../backup.sh (do_backup, restore_database, pg)
# Source:         seasonal-bingo-royale ops/sbr (cmd_update, cmd_confirm, cmd_rollback) and
#                 ops/lib/config.sh (save_stack, restore_stack, prune_images) at d7d841e. The
#                 waiting for running rounds of seasonal-mini-games ops/smg (ae8fe40) is a game's
#                 `game_before_update`. Left in the games: how they build, their database roles and
#                 keys.
# Spec:           kit DECISIONS K87

# Backs up now and prints the new file's path; what the backup says goes to stderr.
sk_admin_backup_now() {
  (
    game_backup_settings "$1"
    SK_BACKUP_SOURCE_ONLY=1
    # shellcheck source=SCRIPTDIR/../backup.sh
    source "$SK_ADMIN_BACKUP"
    do_backup >&2
    printf '%s' "$BACKUP_FILE"
  )
}

# sk_admin_database <env> dump|restore <file>: the database alone, with the backup's functions.
sk_admin_database() {
  (
    game_backup_settings "$1"
    SK_BACKUP_SOURCE_ONLY=1
    # shellcheck source=SCRIPTDIR/../backup.sh
    source "$SK_ADMIN_BACKUP"
    if [[ $2 == restore ]]; then
      restore_database "$3"
    else
      split_db_url
      mapfile -t target < <(pg_target)
      umask 077
      pg pg_dump -Fc "${target[@]}" >"$3.partial"
      mv "$3.partial" "$3"
    fi
  )
}

# The images any environment runs or could roll back to; the others are removed.
sk_admin_prune() {
  local file image used=' '
  for file in "$SK_ADMIN_ETC"/*.env; do
    [[ ! -f $file ]] || used+="$(sk_admin_value "$file" "$SK_ADMIN_IMAGE_KEY") "
  done
  for file in "$SK_ADMIN_STATE"/*/rollback.conf; do
    [[ ! -f $file ]] || used+="$(sk_admin_value "$file" PREVIOUS_IMAGE) "
  done
  for image in $(docker image ls "$SK_ADMIN_IMAGE_REPO" --format '{{.Repository}}:{{.Tag}}'); do
    [[ $used == *" $image "* ]] || docker image rm "$image" >/dev/null 2>&1 || true
  done
}

# The stack files named in SK_ADMIN_STACK_FILES (under SK_ADMIN_ROOT), kept or put back.
sk_admin_stack() {
  local dir=$2/stack
  [[ -n ${SK_ADMIN_STACK_FILES:-} ]] || return 0
  # shellcheck disable=SC2086 # one file name per word
  if [[ $1 == save ]]; then
    rm -rf "$dir"
    install -d -m 0700 "$dir"
    (cd "$SK_ADMIN_ROOT" && cp -a $SK_ADMIN_STACK_FILES "$dir/")
  elif [[ -d $dir ]]; then
    (cd "$dir" && cp -a $SK_ADMIN_STACK_FILES "$SK_ADMIN_ROOT/")
    rm -rf "$dir"
  fi
}

sk_admin_update() {
  local env=$1 ref=${2:-} file dir="$SK_ADMIN_STATE/$1" conf="$SK_ADMIN_ETC/install.conf" backup
  file=$(sk_admin_env_file "$env")
  [[ -n $ref ]] || die "usage: $SK_ADMIN_NAME update <git ref>"
  sk_admin_hook game_build
  sk_admin_hook game_migrations
  # One update at a time: a second one would overwrite the first one's rollback data.
  [[ ! -f $dir/rollback.conf ]] ||
    die "the last update is not confirmed yet: $SK_ADMIN_NAME confirm (it works) or $SK_ADMIN_NAME rollback first"
  SK_ADMIN_NEW_IMAGE=''
  game_build "$env" "$ref"
  [[ -n $SK_ADMIN_NEW_IMAGE ]] || die "game_build named no image (SK_ADMIN_NEW_IMAGE)"
  if sk_admin_has game_before_update; then game_before_update "$env" "$ref"; fi
  backup=$(sk_admin_backup_now "$env")
  info "Backup before the update: $backup"
  install -d -m 0700 "$dir"
  sk_admin_database "$env" dump "$dir/pre-update.dump"
  printf 'PREVIOUS_IMAGE=%s\nPREVIOUS_REF=%s\nMIGRATIONS_BEFORE=%s\n' \
    "$(sk_admin_value "$file" "$SK_ADMIN_IMAGE_KEY")" "$(sk_admin_value "$conf" "$SK_ADMIN_REF_KEY")" \
    "$(game_migrations "$env")" >"$dir/rollback.conf"
  # After the rollback data, so a step that fails from here on can be rolled back.
  sk_admin_stack save "$dir"
  if sk_admin_has game_install_stack; then game_install_stack "$env" "$ref"; fi
  if sk_admin_has game_before_start; then game_before_start "$env" "$ref"; fi
  sk_admin_set "$file" "$SK_ADMIN_IMAGE_KEY" "$SK_ADMIN_NEW_IMAGE"
  sk_admin_set "$conf" "$SK_ADMIN_REF_KEY" "$ref"
  game_compose "$env" up -d
  sk_admin_wait_ready "$env"
  sk_admin_prune
  info "Updated to $ref ($SK_ADMIN_NEW_IMAGE)."
  info "Check the game, then: $SK_ADMIN_NAME confirm (deletes the plain pre-update dump), or $SK_ADMIN_NAME rollback."
}

sk_admin_confirm_update() {
  local dir="$SK_ADMIN_STATE/$1"
  [[ -f $dir/rollback.conf ]] || die "no update waiting for confirmation"
  rm -rf "$dir/pre-update.dump" "$dir/rollback.conf" "$dir/stack" "$dir/env.before"
  sk_admin_prune
  info "Update confirmed: the pre-update dump is deleted; a rollback is no longer possible."
}

sk_admin_rollback() {
  local env=$1 file dir="$SK_ADMIN_STATE/$1" restore=0 image ref before now backup
  file=$(sk_admin_env_file "$env")
  [[ -f $dir/rollback.conf ]] || die "no update to roll back"
  sk_admin_hook game_migrations
  image=$(sk_admin_value "$dir/rollback.conf" PREVIOUS_IMAGE)
  ref=$(sk_admin_value "$dir/rollback.conf" PREVIOUS_REF)
  before=$(sk_admin_value "$dir/rollback.conf" MIGRATIONS_BEFORE)
  now=$(game_migrations "$env")
  ((now <= before)) || restore=1
  if ((restore)); then
    sk_admin_confirm "Roll back to $image? The update changed the database schema, so the data goes back to the moment before the update: everything since then is lost (a backup is taken first)."
  else
    sk_admin_confirm "Roll back to $image? The data stays as it is."
  fi
  backup=$(sk_admin_backup_now "$env")
  info "Backup of the current state: $backup"
  # The database first: if its restore fails, nothing else changed and the updated app is
  # started again on the untouched data.
  if ((restore)); then
    info "Restoring the dump taken before the update."
    SK_ADMIN_STOPPED=$env
    game_compose "$env" stop "$(sk_admin_app)"
    sk_admin_database "$env" restore "$dir/pre-update.dump"
  fi
  if [[ -f $dir/env.before ]]; then install -m 0600 "$dir/env.before" "$file"; fi
  sk_admin_set "$file" "$SK_ADMIN_IMAGE_KEY" "$image"
  [[ -z $ref ]] || sk_admin_set "$SK_ADMIN_ETC/install.conf" "$SK_ADMIN_REF_KEY" "$ref"
  sk_admin_stack restore "$dir"
  if sk_admin_has game_after_restore; then game_after_restore "$env" "$restore"; fi
  game_compose "$env" up -d
  # shellcheck disable=SC2034 # read by sk_admin_cleanup (./admin.sh)
  SK_ADMIN_STOPPED=''
  sk_admin_wait_ready "$env"
  rm -f "$dir/rollback.conf" "$dir/pre-update.dump" "$dir/env.before"
  info "Rolled back to $image (ref ${ref:-unknown})."
}
