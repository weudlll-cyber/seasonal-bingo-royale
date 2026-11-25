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
#                   the one on disk unless `--force-env`, unpacks only the members it knows, and
#                   replaces the database in ONE transaction, so the live data goes only when the
#                   restore succeeded;
#                 - `drill <file>`: restores the database into a throw-away PostgreSQL container
#                   and compares, table by table, the rows it holds with the rows the dump
#                   carries (read from the dump itself, not from a live database that has moved);
#                 - `print-units`: the systemd service, failure and 03:30 timer units;
#                 - `help`.
#                 No secret, key or dump is ever printed: only file names, table names and
#                 counts. Source with SK_BACKUP_SOURCE_ONLY=1 to use the functions (the tests do).
# Depends on:     bash 4, age, tar, GNU date and find, docker (or pg_dump and psql on the host)
# Source:         seasonal-bingo-royale ops/lib/backup.sh at dd35d08 (the rehearsed version:
#                 `do_backup`, `prune_backups`, `unpack`, `restore_database` in one transaction,
#                 the refusal of another environment and of another seed key, the uploads' live
#                 state left out, the timer units) and seasonal-mini-games ops/lib/backup.sh at
#                 1988346 (the throw-away PostgreSQL drill). Generalised only as far as two games
#                 need: the prefix, the database, the volumes, the secret files and the helper
#                 image are variables; Bingo's compose, env file, owner roles and its seed-key
#                 check stay in Bingo.
# Spec:           kit DECISIONS K61; docs/concepts/shared-server-parts.md section 1

set -euo pipefail

# What this run created and must remove on exit: work folders and throw-away containers.
SK_WORK=()
SK_CONTAINERS=()
cleanup() {
  local c
  for c in "${SK_CONTAINERS[@]-}"; do [[ -z $c ]] || docker rm -f "$c" >/dev/null 2>&1 || true; done
  [[ ${#SK_WORK[@]} -eq 0 ]] || rm -rf "${SK_WORK[@]}"
}
trap cleanup EXIT

# new_work: a private work folder, removed on exit; its name is in WORK.
new_work() {
  WORK=$(mktemp -d)
  SK_WORK+=("$WORK")
}

die() {
  printf 'backup: %s\n' "$*" >&2
  exit 1
}
info() { printf '%s\n' "$*"; }
need() { [[ -n ${!1:-} ]] || die "$1 is not set (see docs/OPERATIONS.md)"; }

# The game's variables, with the defaults a game rarely changes.
env_name() { printf '%s' "${SK_BACKUP_ENV:-prod}"; }
keep_daily() { printf '%s' "${SK_BACKUP_KEEP_DAILY:-14}"; }
keep_weeks() { printf '%s' "${SK_BACKUP_KEEP_WEEKS:-8}"; }

# The names a backup's members may have: nothing else is ever unpacked.
MEMBER_PATTERN='^(db\.dump|manifest\.txt|vol-[A-Za-z0-9_.-]+\.tar|secret-[A-Za-z0-9_.-]+)$'

# pg <command...>: a PostgreSQL client command, in the database container or on the host.
pg() {
  if [[ -n ${SK_BACKUP_DB_CONTAINER:-} ]]; then docker exec -i "$SK_BACKUP_DB_CONTAINER" "$@"; else "$@"; fi
}

# pg_target: the arguments that name the database for pg_dump and psql.
pg_target() {
  if [[ -n ${SK_BACKUP_DB_CONTAINER:-} ]]; then
    need SK_BACKUP_DB_USER
    need SK_BACKUP_DB_NAME
    printf '%s\n' -U "$SK_BACKUP_DB_USER" -d "$SK_BACKUP_DB_NAME"
  else
    need SK_BACKUP_DB_URL
    printf '%s\n' --dbname "$SK_BACKUP_DB_URL"
  fi
}

# volume_excludes: the live-state files left out of an uploads volume, as tar arguments. They are
# the game's own (a maintenance flag, a feed's status) and a restore must not bring them back.
volume_excludes() {
  local x
  for x in ${SK_BACKUP_VOLUME_EXCLUDES:-}; do
    [[ $x =~ ^\./[A-Za-z0-9_.-]+$ ]] || die "SK_BACKUP_VOLUME_EXCLUDES holds \"$x\": a path like ./name is expected"
    printf '%s\n' "--exclude=$x"
  done
}

# prune_backups <dir>: keeps the newest SK_BACKUP_KEEP_DAILY (14), and of the older ones the newest
# of each week for SK_BACKUP_KEEP_WEEKS (8) weeks, counted apart from the dailies.
prune_backups() {
  local dir=$1 file week kept=0 weeks=() daily weekly
  daily=$(keep_daily)
  weekly=$(keep_weeks)
  while IFS= read -r file; do
    kept=$((kept + 1))
    ((kept <= daily)) && continue
    week=$(date -u -d "$(basename "$file" | sed -E 's/.*-([0-9]{8})T.*/\1/')" +%G%V)
    if [[ " ${weeks[*]-} " != *" $week "* && ${#weeks[@]} -lt $weekly ]]; then
      weeks+=("$week")
    else
      rm -f "$file"
    fi
  done < <(find "$dir" -maxdepth 1 -name "$SK_BACKUP_PREFIX-$(env_name)-*.tar.age" | sort -r)
}

# add_secret <work>: copies each secret file the game names into the work folder, mode 0600. Only
# the file's name is ever said, never its content.
add_secret() {
  local f
  for f in ${SK_BACKUP_SECRET_FILES:-}; do
    [[ -r $f ]] || die "the secret file $f cannot be read"
    install -m 0600 "$f" "$1/secret-$(basename "$f")"
  done
}

# add_volumes <work>: one tar per named volume, read by a helper container so a crash-looping
# app does not block it.
add_volumes() {
  local v excludes=()
  [[ -n ${SK_BACKUP_VOLUMES:-} ]] || return 0
  need SK_BACKUP_HELPER_IMAGE
  mapfile -t excludes < <(volume_excludes)
  for v in $SK_BACKUP_VOLUMES; do
    docker run --rm --entrypoint tar -v "$v:/data:ro" "$SK_BACKUP_HELPER_IMAGE" \
      -C /data "${excludes[@]}" -cf - . >"$1/vol-$v.tar"
  done
}

# write_manifest <work> <stamp>: what the backup is, never a secret: its prefix, environment and
# time, and the names of its parts.
write_manifest() {
  local f
  {
    printf 'format=1\nprefix=%s\nenv=%s\ncreated=%s\n' "$SK_BACKUP_PREFIX" "$(env_name)" "$2"
    printf 'members='
    for f in "$1"/db.dump "$1"/vol-*.tar "$1"/secret-*; do [[ -e $f ]] && printf '%s ' "${f##*/}"; done
    printf '\n'
  } >"$1/manifest.txt"
}

# do_backup: sets BACKUP_FILE to the new file.
do_backup() {
  local dir work stamp out target=()
  need SK_BACKUP_PREFIX
  need SK_BACKUP_DIR
  need SK_BACKUP_AGE_RECIPIENT
  command -v age >/dev/null || die "age is not installed (apt-get install age)"
  mapfile -t target < <(pg_target)
  dir=$SK_BACKUP_DIR
  new_work
  work=$WORK
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  out="$dir/$SK_BACKUP_PREFIX-$(env_name)-$stamp.tar.age"
  pg pg_dump -Fc "${target[@]}" >"$work/db.dump"
  [[ -s $work/db.dump ]] || die "pg_dump wrote nothing"
  add_volumes "$work"
  add_secret "$work"
  write_manifest "$work" "$stamp"
  if [[ -n ${SK_BACKUP_GROUP:-} ]]; then
    install -d -m 0750 -g "$SK_BACKUP_GROUP" "$dir"
  else
    install -d -m 0750 "$dir"
  fi
  rm -f "$out.partial"
  (cd "$work" && tar -cf - ./* | age -r "$SK_BACKUP_AGE_RECIPIENT") >"$out.partial"
  [[ -z ${SK_BACKUP_GROUP:-} ]] || chgrp "$SK_BACKUP_GROUP" "$out.partial"
  chmod 0640 "$out.partial"
  mv "$out.partial" "$out"
  prune_backups "$dir"
  # shellcheck disable=SC2034 # read by the caller of the sourced function
  BACKUP_FILE=$out
  info "backup written: $(basename "$out")"
}

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

# restore_secrets <dir> <target dir> <force>: puts the backup's secret files into <target dir>.
# A file that is already there and differs stops the restore unless forced (a restored database
# is sealed with the backup's key). Only names are said.
restore_secrets() {
  local f name dest
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
    install -d -m 0700 "$2"
    install -m 0600 "$f" "$dest"
    info "the secret file $name is restored to $2"
  done
}

# restore_database <dump>: in ONE transaction: pg_restore turns the dump into SQL (dropping what it
# recreates), psql runs BEGIN, that SQL and COMMIT, and stops at the first error, which rolls the
# whole thing back. COMMIT is sent only after pg_restore succeeded (&&): a dump it cannot read
# ends the input without COMMIT, and pipefail returns the failure.
restore_database() {
  local target=()
  mapfile -t target < <(pg_target)
  [[ -z ${SK_BACKUP_DB_SCHEMA:-} || ${SK_BACKUP_DB_SCHEMA} =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
    die "SK_BACKUP_DB_SCHEMA is not a plain schema name"
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
  check_manifest "$work" "$3"
  if [[ $4 != 1 ]]; then
    read -r -p "Restore $(basename "$file") over the live $(env_name) data? Everything since that backup is lost. [y/N] " answer
    [[ $answer == y || $answer == Y ]] || die "not restored"
  fi
  [[ -z ${SK_BACKUP_STOP_CMD:-} ]] || bash -c "$SK_BACKUP_STOP_CMD"
  restore_database "$work/db.dump"
  restore_volumes "$work"
  restore_secrets "$work" "$5" "$3"
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

# print_units: the systemd units for the nightly backup, as the game installs them.
print_units() {
  need SK_BACKUP_PREFIX
  need SK_BACKUP_ENV_FILE
  local self p=$SK_BACKUP_PREFIX
  self=$(readlink -f "${BASH_SOURCE[0]}")
  printf '# ---- /etc/systemd/system/%s-backup@.service\n[Unit]\nDescription=%s backup (%%i)\nAfter=docker.service\nRequires=docker.service\nOnFailure=%s-backup-failed@%%i.service\n\n[Service]\nType=oneshot\nEnvironmentFile=%s\nEnvironment=SK_BACKUP_ENV=%%i\nExecStart=%s backup\n\n' "$p" "$p" "$p" "$SK_BACKUP_ENV_FILE" "$self"
  printf '# ---- /etc/systemd/system/%s-backup-failed@.service\n[Unit]\nDescription=%s backup (%%i) failed\n\n[Service]\nType=oneshot\nExecStart=/usr/bin/logger -p user.err -t %s "the backup of %%i failed: journalctl -u %s-backup@%%i"\n\n' "$p" "$p" "$p" "$p"
  printf '# ---- /etc/systemd/system/%s-backup@.timer\n[Unit]\nDescription=%s backup (%%i) every night at 03:30\n\n[Timer]\nOnCalendar=*-*-* 03:30:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n' "$p" "$p"
}

usage() {
  cat <<'EOF'
Usage: ops/backup.sh <command> [options]

  backup                    write an encrypted backup into SK_BACKUP_DIR and prune the old ones
  restore <file>            replace the database, volumes and secret files from a backup
      --identity <file>     your age private key file (required)
      --force-env           restore a backup of another environment, or replace a differing secret
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
