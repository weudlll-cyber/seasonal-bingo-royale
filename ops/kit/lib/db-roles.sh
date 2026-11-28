#!/usr/bin/env bash
# @file   ops/lib/db-roles.sh
# @module ops
# @brief  Sets up a game's owner and app database roles by sending ./db-roles.sql to psql (K90).
#
# Responsibility: sourced by a game's installer or admin command. `sk_db_roles_apply <command…>`
#                 puts the game's names (SK_DB_PREFIX: roles <prefix>_owner and <prefix>_app;
#                 SK_DB_SCHEMA, default the prefix) and the two passwords
#                 (SK_DB_OWNER_PASSWORD, SK_DB_APP_PASSWORD) into the script and writes it to the
#                 command's standard input, a psql as the superuser. The passwords are never on a
#                 command line and never printed. Names must be plain lower-case words and the
#                 passwords 16 to 128 letters, digits, "-" or "_", so nothing can add a statement.
# Depends on:     bash 4, ./db-roles.sql
# Source:         seasonal-bingo-royale ops/lib/config.sh (`apply_db_roles`) at d7d841e.
# Spec:           kit DECISIONS K90; docs/OPERATIONS.md "Database roles"

sk_db_roles_die() {
  printf 'database roles: %s\n' "$*" >&2
  return 1
}

sk_db_roles_apply() {
  local name sql schema=${SK_DB_SCHEMA:-${SK_DB_PREFIX:-}}
  (($#)) || { sk_db_roles_die "pass the psql command to run"; return 1; }
  for name in "${SK_DB_PREFIX:-}" "$schema"; do
    [[ $name =~ ^[a-z][a-z0-9_]{0,40}$ ]] ||
      { sk_db_roles_die "SK_DB_PREFIX and SK_DB_SCHEMA are plain lower-case names"; return 1; }
  done
  for name in SK_DB_OWNER_PASSWORD SK_DB_APP_PASSWORD; do
    # The value is never said.
    [[ ${!name:-} =~ ^[A-Za-z0-9_-]{16,128}$ ]] ||
      { sk_db_roles_die "$name is 16 to 128 letters, digits, - or _"; return 1; }
  done
  sql=$(<"${BASH_SOURCE[0]%/*}/db-roles.sql") || return 1
  sql=${sql//__SCHEMA__/$schema}
  sql=${sql//__OWNER__/${SK_DB_PREFIX}_owner}
  sql=${sql//__APP__/${SK_DB_PREFIX}_app}
  sql=${sql//__OWNER_PASSWORD__/$SK_DB_OWNER_PASSWORD}
  sql=${sql//__APP_PASSWORD__/$SK_DB_APP_PASSWORD}
  # printf is the shell's own, so the script is no process's argument.
  printf '%s\n' "$sql" | "$@"
}
