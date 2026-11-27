#!/usr/bin/env bash
# @file   ops/lib/backup.sh
# @module ops
# @brief  Bingo's backups on the kit's backup script: settings, the seed-key drill, old backups, timer.
#
# Responsibility: the kit's script (../kit/backup.sh, K61, K71) backs up, restores and drills; the
#                 admin command runs it with `game_backup_settings`: SBR_SEED_KEY and
#                 SBR_RECOVERY_KEY travel as its secret files, written by `game_backup_secrets`
#                 before a backup and before a restore compares them (a restore refuses other
#                 keys, a fresh server's included, unless --force-env, before anything changes;
#                 then `after_restore` writes the backup's keys into the env file, gives the
#                 schema back to the owner role and starts the stack). Bingo's own: `drill` (the kit's, then one stored match secret
#                 opened with the backup's seed key), `rewrite_backup` (a backup made before the
#                 kit's format written again as one, until those age out) and the 03:30 timer.
# Depends on:     ./common.sh, ./config.sh (apply_db_roles), ../kit/backup.sh, age, docker
# Used by:        ops/sbr, ops/install.sh (timer)
# Spec:           docs/spec/09-deployment-architecture.md §6; docs/spec/03-security-architecture.md §15

PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
BACKUP_GROUP=sbr-backup
KIT_BACKUP=$(dirname "${BASH_SOURCE[0]}")/../kit/backup.sh

# secret_files <env>: the env file's two keys as files under the state folder (0600, written only
# when they differ), where the kit's backup reads them and its restore compares them and puts
# the backup's.
secret_files() {
  local file="$SBR_ETC/$1.env" dir="$SBR_STATE/$1/secrets" seed recovery
  seed=$(env_value "$file" SBR_SEED_KEY)
  recovery=$(env_value "$file" SBR_RECOVERY_KEY)
  [[ -n $seed ]] || die "no SBR_SEED_KEY in $file: without it no backup can be opened again"
  install -d -m 0700 "$dir"
  # Silent: the caller's output is read (the new backup's path).
  printf '%s\n' "$seed" | put_file "$dir/seed.key" 0600 >/dev/null
  printf '%s\n' "$recovery" | put_file "$dir/recovery.key" 0600 >/dev/null
}

# The kit's hook before a backup and before a restore compares (K61): the files as they are
# now. No command that only reads writes them.
game_backup_secrets() { secret_files "$1"; }

# The kit's backup settings for an environment (its OPERATIONS.md): variables only, `status`
# asks for them too.
game_backup_settings() {
  local env=$1 dir="$SBR_STATE/$1/secrets"
  export SK_BACKUP_PREFIX=sbr SK_BACKUP_ENV="$env" SK_BACKUP_DIR="$SBR_BACKUPS/$env"
  export SK_BACKUP_DB_CONTAINER="sbr-$env-postgres-1" SK_BACKUP_DB_USER=sbr SK_BACKUP_DB_NAME=sbr
  export SK_BACKUP_DB_SCHEMA=sbr SK_BACKUP_GROUP="$BACKUP_GROUP" SK_BACKUP_PG_IMAGE="$PG_IMAGE"
  # The maintenance flag and the website feed's status are live state, not data: a restore must
  # not bring them back (audit M3).
  export SK_BACKUP_VOLUMES="sbr-${env}_uploads" SK_BACKUP_VOLUME_EXCLUDES='./maintenance ./website-feed'
  SK_BACKUP_HELPER_IMAGE=$(env_value "$SBR_ETC/$env.env" SBR_IMAGE)
  SK_BACKUP_AGE_RECIPIENT=$(env_value "$SBR_ETC/$env.env" SBR_AGE_RECIPIENT)
  export SK_BACKUP_HELPER_IMAGE SK_BACKUP_AGE_RECIPIENT
  export SK_BACKUP_SECRET_FILES="$dir/seed.key $dir/recovery.key" SK_ADMIN_SECRETS_DIR="$dir"
  export SK_BACKUP_STOP_CMD="'$SBR_ROOT/sbr' --env $env stop_app"
  export SK_BACKUP_START_CMD="'$SBR_ROOT/sbr' --env $env after_restore"
}

# The restore's stop command.
game_cmd_stop_app() { compose "$1" stop app; }

# restored_key <env> <seed|recovery> <env key>: the restored secret file's key into the env file.
restored_key() {
  local key file="$SBR_ETC/$1.env"
  key=$(tr -d '[:space:]' <"$SBR_STATE/$1/secrets/$2.key" 2>/dev/null || true)
  [[ -n $key && $key != "$(env_value "$file" "$3")" ]] || return 0
  set_env_value "$file" "$3" "$key"
  info "The backup's $2 key is now the one of $1."
}

# The restore's start command: the backup's keys, the schema back to the owner role (a restored
# dump belongs to the superuser), the stack up (the migrate service grants the app role again;
# a changed env file recreates the app).
game_cmd_after_restore() {
  local env=$1
  restored_key "$env" seed SBR_SEED_KEY
  restored_key "$env" recovery SBR_RECOVERY_KEY
  if [[ -n $(env_value "$SBR_ETC/$env.env" SBR_DB_APP_PASSWORD) ]]; then apply_db_roles "$env"; fi
  compose "$env" up -d
  wait_ready "$env"
}

# backup_args <usage> <args…>: sets BACKUP_PATH and IDENTITY from "<file> --identity <key>".
backup_args() {
  local usage=$1
  shift
  BACKUP_PATH='' IDENTITY=''
  while (($#)); do
    case $1 in
      --identity) IDENTITY=${2:-}; shift ;;
      *) BACKUP_PATH=$1 ;;
    esac
    shift
  done
  [[ -f $BACKUP_PATH && -n $IDENTITY ]] || die "usage: sbr $usage <file> --identity <age key file>"
}

# drill_database <name>: a throw-away PostgreSQL container, ready within 60 s.
drill_database() {
  local name=$1 i
  cleanup_container "$name"
  docker run -d --rm --name "$name" -e POSTGRES_USER=sbr -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=sbr "$PG_IMAGE" >/dev/null
  for i in $(seq 1 60); do
    # Over TCP: a new database's temporary first server answers on the socket, then stops.
    docker exec "$name" pg_isready -h 127.0.0.1 -U sbr -d sbr >/dev/null 2>&1 && break
    ((i < 60)) || die "the throw-away database did not start within 60 s"
    sleep 1
  done
}

# drill: the kit's drill (every table's rows against the dump), then Bingo's: the dump in a
# throw-away database, its counts, and one stored sealed seed opened with the backup's seed key.
game_cmd_drill() {
  local env=$1 work name="sbr-drill-$$" counts key opened
  shift
  backup_args drill "$@"
  sk_admin_script "$env" drill "$BACKUP_PATH" --identity "$IDENTITY"
  trap sbr_cleanup EXIT
  work=$(mktemp -d)
  cleanup_path "$work"
  # The kit's own unpacking, in a subshell: its helpers of the same names never replace ours.
  (
    game_backup_settings "$env"
    SK_BACKUP_SOURCE_ONLY=1
    # shellcheck source=ops/kit/backup.sh
    source "$KIT_BACKUP"
    trap - EXIT
    unpack "$BACKUP_PATH" "$IDENTITY" "$work"
  )
  [[ -f $work/secret-seed.key ]] || die "this backup holds no seed key: its matches cannot be opened; take a new backup"
  key=$(tr -d '[:space:]' <"$work/secret-seed.key")
  drill_database "$name"
  docker exec -i "$name" pg_restore -U sbr -d sbr --no-owner --no-acl --exit-on-error <"$work/db.dump"
  counts=$(docker exec "$name" psql -U sbr -d sbr -tA -c \
    "SELECT (SELECT count(*) FROM sbr.schema_migrations) || ' migrations, ' || (SELECT count(*) FROM sbr.accounts) || ' accounts, ' || (SELECT count(*) FROM sbr.matches) || ' matches, ' || (SELECT count(*) FROM sbr.match_events) || ' events'")
  [[ -n $counts ]] || die "the drill restored nothing readable"
  # The app's own code (dist/cli.js check-seed-key) on the drill database's network; the key
  # travels in the environment, never on a command line another user could read.
  opened=$(SBR_SEED_KEY=$key docker run --rm --network "container:$name" -e SBR_SEED_KEY \
    -e DATABASE_URL=postgres://sbr:drill@127.0.0.1:5432/sbr \
    "$(env_value "$SBR_ETC/$env.env" SBR_IMAGE)" node dist/cli.js check-seed-key) ||
    die "drill FAILED: the backup's seed key does not open its stored match secrets (message above)"
  info "Bingo's drill passed: $counts; $opened"
}

# rewrite_parts <dir> <env>: an old backup's parts under the kit's names.
rewrite_parts() {
  local dir=$1 env=$2
  [[ -s $dir/db.dump ]] || die "no database dump in the backup"
  [[ ! -f $dir/uploads.tar ]] || mv "$dir/uploads.tar" "$dir/vol-sbr-${env}_uploads.tar"
  [[ ! -f $dir/seed.key ]] || mv "$dir/seed.key" "$dir/secret-seed.key"
  [[ ! -f $dir/recovery.key ]] || mv "$dir/recovery.key" "$dir/secret-recovery.key"
}

# rewrite_backup: a backup made before the kit's format (uploads.tar, seed.key, recovery.key, no
# manifest), written again as the kit's, for `sbr restore` and `sbr drill`. The old file stays.
game_cmd_rewrite_backup() {
  local env=$1 work stamp out
  shift
  backup_args rewrite_backup "$@"
  trap sbr_cleanup EXIT
  work=$(mktemp -d)
  cleanup_path "$work"
  install -d -m 0700 "$work/parts"
  age -d -i "$IDENTITY" "$BACKUP_PATH" >"$work/archive.tar" || die "cannot decrypt $BACKUP_PATH"
  ! tar -tf "$work/archive.tar" | grep -Eqx '(\./)?manifest\.txt' ||
    die "$(basename "$BACKUP_PATH") is already the kit's format: restore it as it is"
  tar -C "$work/parts" -xf "$work/archive.tar"
  rewrite_parts "$work/parts" "$env"
  # The old file's own time stays in the new name.
  stamp=$(basename "$BACKUP_PATH" | sed -nE 's/.*-([0-9]{8}T[0-9]{6}Z).*/\1/p')
  stamp=${stamp:-$(date -u +%Y%m%dT%H%M%SZ)}
  out=$(
    game_backup_settings "$env"
    SK_BACKUP_SOURCE_ONLY=1
    # shellcheck source=ops/kit/backup.sh
    source "$KIT_BACKUP"
    trap - EXIT
    write_manifest "$work/parts" "$stamp"
    out="$SK_BACKUP_DIR/sbr-$env-$stamp-rewritten.tar.age"
    install -d -m 0750 -g "$SK_BACKUP_GROUP" "$SK_BACKUP_DIR"
    (cd "$work/parts" && tar -cf - ./* | age -r "$SK_BACKUP_AGE_RECIPIENT") >"$out.partial"
    chgrp "$SK_BACKUP_GROUP" "$out.partial"
    chmod 0640 "$out.partial"
    mv "$out.partial" "$out"
    printf '%s' "$out"
  )
  info "written again as $out"
}

# install_backup_units <env>: the backup group, age, the systemd timer for 03:30 and the
# unit a failed backup starts (OnFailure=), which logs it (sbr status asks systemd).
install_backup_units() {
  local env=$1
  getent group "$BACKUP_GROUP" >/dev/null || run groupadd --system "$BACKUP_GROUP"
  # The parent too is the group's, so a user in it can pull the backups.
  run install -d -m 0750 -g "$BACKUP_GROUP" "$SBR_BACKUPS"
  if ! command -v age >/dev/null; then
    run apt-get update -q
    run apt-get install -y -q age
  fi
  put_file /etc/systemd/system/sbr-backup@.service 0644 <<'EOF'
[Unit]
Description=Seasonal Bingo Royale backup (%i)
After=docker.service
Requires=docker.service
OnFailure=sbr-backup-failed@%i.service

[Service]
Type=oneshot
ExecStart=/opt/sbr/sbr --env %i backup
EOF
  put_file /etc/systemd/system/sbr-backup-failed@.service 0644 <<'EOF'
[Unit]
Description=Seasonal Bingo Royale backup (%i) failed

[Service]
Type=oneshot
ExecStart=/usr/bin/logger -p user.err -t sbr "the backup of %i failed: journalctl -u sbr-backup@%i"
EOF
  put_file /etc/systemd/system/sbr-backup@.timer 0644 <<'EOF'
[Unit]
Description=Seasonal Bingo Royale backup (%i) every night at 03:30

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
  run systemctl daemon-reload
  run systemctl enable --now "sbr-backup@$env.timer"
}
