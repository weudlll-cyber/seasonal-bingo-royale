#!/usr/bin/env bash
# @file   ops/backup.sh
# @module ops
# @brief  Encrypted backups of a game: PostgreSQL, uploads volumes and a few secret files, with
#         retention, a restore that refuses another environment's backup, and a restore drill.
#
# Responsibility: one script, parametrised by the game's variables (docs/OPERATIONS.md lists
#                 every `SK_BACKUP_*` one):
#                 - `backup`: `pg_dump -Fc` of the database (in a container, or by connection
#                   string), a tar of each named Docker volume (minus live-state files the game
#                   names), and the secret files the game names (its seed and recovery keys: a
#                   backup is useless without them), written into ONE tar encrypted with `age`
#                   to the operator's public key, as <prefix>-<env>-<UTC stamp>.tar.age (written
#                   as .partial, renamed when complete), then pruned: the 14 newest, and of the
#                   older ones the newest of each of 8 weeks;
#                 - `restore <file>`: refuses a file of another prefix or environment (by name
#                   and by its manifest) unless `--force-env`, refuses a secret that differs from
#                   the one on disk unless `--force-env`, unpacks only the members it knows,
#                   decides every refusal before anything is replaced, and replaces the database
#                   in ONE transaction, so the live data goes only when the restore succeeded;
#                 - `drill <file>`: restores the database into a throw-away PostgreSQL container
#                   and compares, table by table, the rows it holds with the rows the dump
#                   carries (read from the dump itself, not from a live database that has moved);
#                 - `print-units`: the systemd service, failure and 03:30 timer units, which run
#                   this file by the path it was called by (never one inside the pnpm store);
#                 - `help`.
#                 No secret, key or dump is ever printed: only file names, table names and
#                 counts. Source with SK_BACKUP_SOURCE_ONLY=1 to use the functions (the tests do).
#                 The functions are in ./lib/backup-core.sh and ./lib/backup-restore.sh (since
#                 v0.25.0, K71), which ship beside this file.
# Depends on:     ./lib/backup-core.sh, ./lib/backup-restore.sh
# Source:         seasonal-bingo-royale ops/lib/backup.sh at dd35d08 (the rehearsed version:
#                 `do_backup`, `prune_backups`, `unpack`, `restore_database` in one transaction,
#                 the refusal of another environment and of another seed key, the uploads' live
#                 state left out, the timer units) and seasonal-mini-games ops/lib/backup.sh at
#                 1988346 (the throw-away PostgreSQL drill). Generalised only as far as two games
#                 need: the prefix, the database, the volumes, the secret files and the helper
#                 image are variables; Bingo's compose, env file, owner roles and its seed-key
#                 check stay in Bingo.
# Spec:           kit DECISIONS K61, K71; docs/concepts/shared-server-parts.md section 1

set -euo pipefail

# This file, resolved: the libraries lie beside it.
SK_SELF=$(readlink -f "${BASH_SOURCE[0]}")
# This file as invoked, absolute but with its links kept: what the timer's service runs. Through a
# game's node_modules/@seasonal/kit link it survives a kit update; the resolved path does not.
SK_INVOKED=$(realpath -s "${BASH_SOURCE[0]}")
# shellcheck source=SCRIPTDIR/lib/backup-core.sh
source "${SK_SELF%/*}/lib/backup-core.sh"
# shellcheck source=SCRIPTDIR/lib/backup-restore.sh
source "${SK_SELF%/*}/lib/backup-restore.sh"

usage() {
  cat <<'EOF'
Usage: ops/backup.sh <command> [options]

  backup                    write an encrypted backup into SK_BACKUP_DIR and prune the old ones
  restore <file>            replace the database, volumes and secret files from a backup
      --identity <file>     your age private key file (required)
      --force-env           restore a backup of another environment, or replace a differing secret
                            (expected on a new server, which has keys of its own)
      --yes                 do not ask
      --secrets-to <dir>    where the backup's secret files go (otherwise only their names are said)
  drill <file> --identity <file>
                            restore into a throw-away PostgreSQL container and compare row counts
  print-units               the systemd service, failure and timer units for the nightly backup
  help                      this text

Every setting is an SK_BACKUP_* variable; docs/OPERATIONS.md lists them all. No command prints a
secret, a key or the content of a dump.
EOF
}

main() {
  local cmd=${1:-help} file='' identity='' force=0 yes=0 secrets=''
  shift || true
  while (($#)); do
    case $1 in
      --identity) identity=${2:?--identity needs a file}; shift 2 ;;
      --force-env) force=1; shift ;;
      --yes) yes=1; shift ;;
      --secrets-to) secrets=${2:?--secrets-to needs a folder}; shift 2 ;;
      -*) die "unknown option $1" ;;
      *) file=$1; shift ;;
    esac
  done
  case $cmd in
    backup) do_backup ;;
    restore) [[ -n $file ]] || die "restore needs a backup file"; do_restore "$file" "$identity" "$force" "$yes" "$secrets" ;;
    drill) [[ -n $file ]] || die "drill needs a backup file"; do_drill "$file" "$identity" ;;
    print-units) print_units ;;
    help | -h | --help) usage ;;
    *) usage >&2; die "unknown command $cmd" ;;
  esac
}

# Sourced for its functions (the tests), or run.
if [[ ${SK_BACKUP_SOURCE_ONLY:-0} != 1 ]]; then main "$@"; fi
