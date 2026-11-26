#!/usr/bin/env bash
# @file   ops/lib/backup-restore.sh
# @module ops
# @brief  The restore, its refusals and the restore drill.
#
# Responsibility: sourced by ../backup.sh, which sets `set -euo pipefail` and describes every
#                 command; not run on its own.
# Depends on:     ./backup-core.sh
# Source:         ops/backup.sh as released in v0.21.0, split unchanged (v0.25.0, K71); that file
#                 has it from seasonal-bingo-royale ops/lib/backup.sh at dd35d08 and
#                 seasonal-mini-games ops/lib/backup.sh at 1988346.
# Spec:           kit DECISIONS K61, K71

# WORK is set by new_work, in ./backup-core.sh, which the entry sources first.
# shellcheck disable=SC2153

# The names a backup's members may have: nothing else is ever unpacked.
MEMBER_PATTERN='^(db\.dump|manifest\.txt|vol-[A-Za-z0-9_.-]+\.tar|secret-[A-Za-z0-9_.-]+)$'

# unpack <file> <identity> <dir>: decrypts a backup and unpacks it into <dir>, only if every
# member has a name this script knows (no path, no link, nothing else).
unpack() {
  local file=$1 identity=$2 dir=$3 bad
  [[ -n $identity ]] || die "this backup is encrypted: pass your age key file with --identity <file>"
  [[ -r $file ]] || die "cannot read $file"
  age -d -i "$identity" "$file" >"$dir/archive.tar"
  bad=$(tar -tf "$dir/archive.tar" | sed -E 's#^\./##' | grep -Evc "$MEMBER_PATTERN" || true)
  [[ $bad == 0 ]] || die "$(basename "$file") holds a member this script does not know: not unpacked"
  tar -C "$dir" -xf "$dir/archive.tar"
  rm -f "$dir/archive.tar"
  [[ -s $dir/db.dump && -s $dir/manifest.txt ]] || die "no database dump or manifest in $(basename "$file")"
}

# manifest_value <dir> <key>: one value of an unpacked backup's manifest.
manifest_value() { sed -n "s/^$2=//p" "$1/manifest.txt" | head -n 1; }

# check_env <file> <force>: the file's name says its prefix and environment; another one is
# refused unless forced (the manifest is checked again after unpacking).
check_env() {
  local want
  want="$SK_BACKUP_PREFIX-$(env_name)-"
  [[ $(basename "$1") == "$want"* || $2 == 1 ]] ||
    die "$(basename "$1") is not a backup of $(env_name); pass --force-env to restore it anyway"
}

# check_manifest <dir> <force>: the manifest must agree with the name.
check_manifest() {
  local prefix env
  prefix=$(manifest_value "$1" prefix)
  env=$(manifest_value "$1" env)
  [[ ($prefix == "$SK_BACKUP_PREFIX" && $env == "$(env_name)") || $2 == 1 ]] ||
    die "this is a backup of $prefix/$env, not of $SK_BACKUP_PREFIX/$(env_name); pass --force-env to restore it anyway"
}

# check_secrets <dir> <target dir> <force>: every refusal about the secret files, and the notice
# that they are only named without a target dir. A file that is already there and differs stops the
# restore unless forced (a restored database is sealed with the backup's key). Only names are said.
check_secrets() {
  local f name dest
  [[ -z $2 || ! -e $2 || -d $2 ]] || die "$2 is not a folder: --secrets-to needs a folder"
  for f in "$1"/secret-*; do
    [[ -e $f ]] || continue
    name=${f##*/secret-}
    if [[ -z $2 ]]; then
      info "the backup holds the secret file $name; pass --secrets-to <folder> to restore it"
      continue
    fi
    dest="$2/$name"
    if [[ -e $dest ]] && ! cmp -s "$f" "$dest" && [[ $3 != 1 ]]; then
      die "the backup's $name differs from $dest; pass --force-env to replace it with the backup's"
    fi
  done
}

# restore_secrets <dir> <target dir>: puts the backup's secret files into <target dir>, if one is
# given. check_secrets has run first.
restore_secrets() {
  local f name
  [[ -n $2 ]] || return 0
  for f in "$1"/secret-*; do
    [[ -e $f ]] || continue
    name=${f##*/secret-}
    install -d -m 0700 "$2"
    install -m 0600 "$f" "$2/$name"
    info "the secret file $name is restored to $2"
  done
}

# check_database_settings: refuses a database address or schema name the restore cannot use.
check_database_settings() {
  split_db_url
  pg_target >/dev/null
  [[ -z ${SK_BACKUP_DB_SCHEMA:-} || ${SK_BACKUP_DB_SCHEMA} =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
    die "SK_BACKUP_DB_SCHEMA is not a plain schema name"
}

# check_restore <dir> <secrets-to> <force>: everything that can refuse a restore, decided while
# nothing is stopped or replaced yet.
check_restore() {
  check_manifest "$1" "$3"
  check_database_settings
  if [[ -n ${SK_BACKUP_VOLUMES:-} ]]; then
    need SK_BACKUP_HELPER_IMAGE
    volume_excludes >/dev/null
  fi
  check_secrets "$1" "$2" "$3"
}

# restore_database <dump>: in ONE transaction: pg_restore turns the dump into SQL (dropping what it
# recreates), psql runs BEGIN, that SQL and COMMIT, and stops at the first error, which rolls the
# whole thing back. COMMIT is sent only after pg_restore succeeded (&&): a dump it cannot read
# ends the input without COMMIT, and pipefail returns the failure.
restore_database() {
  local target=()
  check_database_settings
  mapfile -t target < <(pg_target)
  {
    printf 'SET client_min_messages = warning;\nBEGIN;\n'
    [[ -z ${SK_BACKUP_DB_SCHEMA:-} ]] || printf 'DROP SCHEMA IF EXISTS %s CASCADE;\n' "$SK_BACKUP_DB_SCHEMA"
    pg pg_restore --clean --if-exists --no-owner --no-acl -f - <"$1" && printf 'COMMIT;\n'
  } | pg psql -X -q -o /dev/null -v ON_ERROR_STOP=1 "${target[@]}"
}

# restore_volumes <dir>: replaces each named volume's content with the backup's, leaving the
# live-state files the game names as they are.
restore_volumes() {
  local v keep='' x
  [[ -n ${SK_BACKUP_VOLUMES:-} ]] || return 0
  need SK_BACKUP_HELPER_IMAGE
  for x in ${SK_BACKUP_VOLUME_EXCLUDES:-}; do keep="$keep ! -name ${x#./}"; done
  for v in $SK_BACKUP_VOLUMES; do
    [[ -s $1/vol-$v.tar ]] || { info "the backup holds no copy of the volume $v: left as it is"; continue; }
    docker run --rm -i --entrypoint sh -v "$v:/data" "$SK_BACKUP_HELPER_IMAGE" -c \
      "find /data -mindepth 1 -maxdepth 1 $keep -exec rm -rf {} + && tar -C /data $(volume_excludes | tr '\n' ' ') -xf -" <"$1/vol-$v.tar"
  done
}

# do_restore <file> <identity> <force> <yes> <secrets-to>
do_restore() {
  local file=$1 work answer
  need SK_BACKUP_PREFIX
  check_env "$file" "$3"
  new_work
  work=$WORK
  unpack "$file" "$2" "$work"
  check_restore "$work" "$5" "$3"
  if [[ $4 != 1 ]]; then
    read -r -p "Restore $(basename "$file") over the live $(env_name) data? Everything since that backup is lost. [y/N] " answer
    [[ $answer == y || $answer == Y ]] || die "not restored"
  fi
  [[ -z ${SK_BACKUP_STOP_CMD:-} ]] || bash -c "$SK_BACKUP_STOP_CMD"
  restore_database "$work/db.dump"
  restore_volumes "$work"
  restore_secrets "$work" "$5"
  [[ -z ${SK_BACKUP_START_CMD:-} ]] || bash -c "$SK_BACKUP_START_CMD"
  info "restored $(basename "$file")"
}

# dump_counts <container>: "<table> <rows>" for every table the dump carries, counted in the
# dump's own COPY blocks.
dump_counts() {
  docker exec -i "$1" pg_restore --data-only -f - |
    awk '/^COPY /{t=$2; n=0; inside=1; next} inside && /^\\\.$/{print t, n; inside=0; next} inside{n++}'
}

# do_drill <file> <identity>: restores into a throw-away container and compares each table.
do_drill() {
  local file=$1 work name="sk-drill-$$" i table rows have bad=0 tables=0
  need SK_BACKUP_PREFIX
  need SK_BACKUP_PG_IMAGE
  new_work
  work=$WORK
  SK_CONTAINERS+=("$name")
  unpack "$file" "$2" "$work"
  docker run -d --rm --name "$name" -e POSTGRES_USER=drill -e POSTGRES_PASSWORD=drill \
    -e POSTGRES_DB=drill "$SK_BACKUP_PG_IMAGE" >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -U drill -d drill >/dev/null 2>&1 && break
    ((i < 60)) || die "the throw-away database did not start within 60 s"
    sleep 1
  done
  sleep 2
  docker exec -i "$name" pg_restore -U drill -d drill --no-owner --no-acl --exit-on-error <"$work/db.dump"
  while read -r table rows; do
    tables=$((tables + 1))
    have=$(docker exec "$name" psql -U drill -d drill -tA -c "SELECT count(*) FROM $table")
    if [[ $have == "$rows" ]]; then info "  $table: $rows rows restored"; else info "  $table: the dump has $rows rows, the restored table $have"; bad=1; fi
  done < <(dump_counts "$name" <"$work/db.dump")
  ((tables > 0)) || die "the drill restored no table with data"
  ((bad == 0)) || die "drill FAILED: a table came back with other rows than the dump holds"
  info "drill passed: $tables tables, every row count equal; $(find "$work" -name 'vol-*.tar' | wc -l | tr -d ' ') volume copies, $(find "$work" -name 'secret-*' | wc -l | tr -d ' ') secret files"
}
