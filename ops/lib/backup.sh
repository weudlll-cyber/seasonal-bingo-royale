#!/usr/bin/env bash
# @file   ops/lib/backup.sh
# @module ops
# @brief  Bingo's backups on the kit's backup script: settings, restore, drill, timer.
#
# Responsibility: the kit's script (../kit/backup.sh, in the verbatim copy of @seasonal/kit's
#                 ops folder, K61, K71) does the dump, the encryption to the operator's age public
#                 key, the retention (14 newest, 8 weekly), the one-transaction database restore,
#                 the uploads and its drill; here are Bingo's SK_BACKUP_* settings and what stays
#                 Bingo's: SBR_SEED_KEY and SBR_RECOVERY_KEY travel as the backup's secret files
#                 (sealed secrets and recovery codes need them; a restore takes the backup's), a
#                 restore refuses another env's seed key unless --force-env BEFORE anything is
#                 touched, stops the app, re-gives the restored schema to the owner role
#                 (./config.sh apply_db_roles), and reads backups made before the kit's format
#                 (uploads.tar, seed.key, recovery.key, no manifest); the drill also opens one
#                 stored match secret with the backup's seed key. Timer 03:30.
# Depends on:     ./common.sh (compose, run, put_file, env_value, set_env_value, confirm,
#                 cleanup, stop_app), ./config.sh (apply_db_roles), ../kit/backup.sh, age, docker
# Used by:        ops/sbr, ops/install.sh (timer)
# Spec:           docs/spec/09-deployment-architecture.md §6; docs/spec/03-security-architecture.md §15

PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
BACKUP_GROUP=sbr-backup
KIT_BACKUP=$(dirname "${BASH_SOURCE[0]}")/../kit/backup.sh

# kit_settings <env>: Bingo's settings of the kit's script, exported (call in a subshell).
kit_settings() {
  local env=$1
  export SK_BACKUP_PREFIX=sbr SK_BACKUP_ENV="$env" SK_BACKUP_DIR="$SBR_BACKUPS/$env"
  export SK_BACKUP_DB_CONTAINER="sbr-$env-postgres-1" SK_BACKUP_DB_USER=sbr SK_BACKUP_DB_NAME=sbr
  export SK_BACKUP_DB_SCHEMA=sbr SK_BACKUP_GROUP="$BACKUP_GROUP" SK_BACKUP_PG_IMAGE="$PG_IMAGE"
  # The maintenance flag and the website feed's status are live state, not data: a restore must
  # not bring them back (audit M3).
  export SK_BACKUP_VOLUMES="sbr-${env}_uploads" SK_BACKUP_VOLUME_EXCLUDES='./maintenance ./website-feed'
  SK_BACKUP_HELPER_IMAGE=$(env_value "$SBR_ETC/$env.env" SBR_IMAGE)
  export SK_BACKUP_HELPER_IMAGE
}

# kit <env> <function...>: one of the kit script's functions with Bingo's settings, in a
# subshell, so that its helpers of the same names (die, info, cleanup) never replace ours.
kit() (
  kit_settings "$1"
  shift
  # shellcheck source=ops/kit/backup.sh
  SK_BACKUP_SOURCE_ONLY=1 source "$KIT_BACKUP"
  "$@"
)

# do_backup <env>: sets BACKUP_FILE to the new file (runs in this shell, so errors stop it).
do_backup() {
  local env=$1 recipient seed recovery keys said
  recipient=$(env_value "$SBR_ETC/$env.env" SBR_AGE_RECIPIENT)
  seed=$(env_value "$SBR_ETC/$env.env" SBR_SEED_KEY)
  recovery=$(env_value "$SBR_ETC/$env.env" SBR_RECOVERY_KEY)
  [[ -n $recipient ]] || die "no age public key in $SBR_ETC/$env.env (SBR_AGE_RECIPIENT)"
  [[ -n $seed ]] || die "no SBR_SEED_KEY in $SBR_ETC/$env.env: without it no backup can be opened again"
  keys=$(mktemp -d)
  cleanup_path "$keys"
  # Only these two values of the env file travel with the backup (inside the encryption).
  (
    umask 077
    printf '%s\n' "$seed" >"$keys/seed.key"
    printf '%s\n' "$recovery" >"$keys/recovery.key"
  )
  install -d -m 0750 -g "$BACKUP_GROUP" "$SBR_BACKUPS"
  said=$(
    kit_settings "$env"
    SK_BACKUP_AGE_RECIPIENT=$recipient SK_BACKUP_SECRET_FILES="$keys/seed.key $keys/recovery.key" \
      bash "$KIT_BACKUP" backup
  ) || die "the backup of $env failed (message above)"
  rm -f "$SBR_STATE/$env/backup-failed"
  # shellcheck disable=SC2034 # read by ops/sbr after the call
  BACKUP_FILE="$SBR_BACKUPS/$env/${said##*backup written: }"
}

# unpack_backup <env> <file> <identity> <dir>: a backup of either format into <dir>, laid out as
# the kit's (db.dump, vol-<volume>.tar, secret-*.key). Sets BACKUP_KIND to kit or old.
unpack_backup() {
  local env=$1 file=$2 identity=$3 dir=$4 volume
  if [[ $file == *.age ]]; then
    [[ -n $identity ]] || die "this backup is encrypted: pass your age key file with --identity <file>"
    age -d -i "$identity" "$file" >"$dir/archive.tar" || die "cannot decrypt $file"
  else
    cp "$file" "$dir/archive.tar"
  fi
  if tar -tf "$dir/archive.tar" | grep -Eqx '(\./)?manifest\.txt'; then
    BACKUP_KIND=kit
    rm -f "$dir/archive.tar"
    kit "$env" unpack "$file" "$identity" "$dir" || die "cannot unpack $file"
  else
    # Made before the kit's format: the same parts under their old names.
    BACKUP_KIND=old
    tar -C "$dir" -xf "$dir/archive.tar"
    rm -f "$dir/archive.tar"
    [[ ! -f $dir/uploads.tar ]] || mv "$dir/uploads.tar" "$dir/vol-sbr-${env}_uploads.tar"
    [[ ! -f $dir/seed.key ]] || mv "$dir/seed.key" "$dir/secret-seed.key"
    [[ ! -f $dir/recovery.key ]] || mv "$dir/recovery.key" "$dir/secret-recovery.key"
  fi
  [[ -s $dir/db.dump ]] || die "no database dump in $file"
  # Another environment's backup (--force-env): its uploads go into this one's volume.
  volume="$dir/vol-sbr-${env}_uploads.tar"
  if [[ ! -f $volume ]]; then
    for volume in "$dir"/vol-*.tar; do
      [[ ! -f $volume ]] || mv "$volume" "$dir/vol-sbr-${env}_uploads.tar"
    done
  fi
}

# backup_key <dir> <seed|recovery>: that key of an unpacked backup, or nothing (made before
# backups carried it).
backup_key() {
  [[ -f $1/secret-$2.key ]] || return 0
  tr -d '[:space:]' <"$1/secret-$2.key"
}

# restore_recovery_key <env> <unpacked backup>: the backup's recovery key (K20) replaces the
# env file's, as the restored recovery codes are stored under it. A backup made before the key
# carries none: the env file keeps its own (codes stored before it still work, K27).
restore_recovery_key() {
  local key
  key=$(backup_key "$2" recovery)
  [[ -n $key && $key != "$(env_value "$SBR_ETC/$1.env" SBR_RECOVERY_KEY)" ]] || return 0
  set_env_value "$SBR_ETC/$1.env" SBR_RECOVERY_KEY "$key"
  info "The backup's recovery key is now the one of $1."
}

# choose_seed_key <env> <backup key> <force-env>: sets RESTORE_SEED_KEY to the key the env
# file holds after the restore. The environment's own key when the backup has none or the
# same one; the backup's when the env file has none; another key stops unless --force-env,
# which takes the backup's (the restored matches are sealed with it).
choose_seed_key() {
  local saved
  saved=$(env_value "$SBR_ETC/$1.env" SBR_SEED_KEY)
  RESTORE_SEED_KEY=${saved:-$2}
  if [[ -z $2 ]]; then
    warn "this backup holds no seed key (made before backups carried it): $1 keeps its own, which must be the one of the backup"
  elif [[ -n $saved && $2 != "$saved" ]]; then
    [[ $3 == 1 ]] || die "the backup's seed key differs from the one in $SBR_ETC/$1.env; pass --force-env to restore it with the backup's key"
    warn "the backup's seed key replaces the one in $SBR_ETC/$1.env (--force-env)"
    RESTORE_SEED_KEY=$2
  fi
}

# do_restore <env> <file> <identity> <force-env>: replaces the database and the uploads.
do_restore() {
  local env=$1 file=$2 work
  if [[ $(basename "$file") != sbr-"$env"-* && $4 != 1 ]]; then
    die "$(basename "$file") is not a backup of $env; pass --force-env to restore it anyway"
  fi
  work=$(mktemp -d)
  cleanup_path "$work"
  unpack_backup "$env" "$file" "$3" "$work"
  [[ $BACKUP_KIND == old ]] || kit "$env" check_manifest "$work" "$4" || exit 1
  # Every refusal comes before anything is touched.
  choose_seed_key "$env" "$(backup_key "$work" seed)" "$4"
  confirm "Restore $(basename "$file") over the live $env data? Everything since that backup is lost."
  stop_app "$env"
  restore_database "$env" "$work/db.dump"
  # The restored schema belongs to the superuser: back to the owner role (audit-3 S1); the
  # migrate service grants the app role again on the next up.
  if [[ -n $(env_value "$SBR_ETC/$env.env" SBR_DB_APP_PASSWORD) ]]; then apply_db_roles "$env"; fi
  kit "$env" restore_volumes "$work"
  if [[ $RESTORE_SEED_KEY != "$(env_value "$SBR_ETC/$env.env" SBR_SEED_KEY)" ]]; then
    set_env_value "$SBR_ETC/$env.env" SBR_SEED_KEY "$RESTORE_SEED_KEY"
  fi
  restore_recovery_key "$env" "$work"
  # up, not start: a changed env file (the seed key) recreates the app container.
  compose "$env" up -d
  restart_app_done
  wait_ready "$env"
}

# restore_database <env> <dump>: drops the schema and restores the dump in ONE transaction (the
# kit's, audit H3); also `sbr rollback`'s way back to the pre-update dump.
restore_database() { kit "$1" restore_database "$2"; }

# drill_database <name>: a throw-away PostgreSQL container, ready within 60 s.
drill_database() {
  local name=$1 i
  cleanup_container "$name"
  docker run -d --rm --name "$name" -e POSTGRES_USER=sbr -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=sbr "$PG_IMAGE" >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -U sbr -d sbr >/dev/null 2>&1 && break
    ((i < 60)) || die "the throw-away database did not start within 60 s"
    sleep 1
  done
  sleep 2
}

# do_drill <env> <file> <identity>: the kit's drill (every table's rows against the dump), then
# Bingo's: a restore into a throw-away database, its counts, and one stored sealed seed opened
# with the backup's seed key.
do_drill() {
  local env=$1 work name="sbr-drill-$$" counts key image opened
  work=$(mktemp -d)
  cleanup_path "$work"
  unpack_backup "$env" "$2" "$3" "$work"
  if [[ $BACKUP_KIND == kit ]]; then
    kit "$env" do_drill "$2" "$3" || die "drill FAILED (the kit's, message above)"
  else
    warn "made before the kit's format: only Bingo's drill reads it"
  fi
  key=$(backup_key "$work" seed)
  [[ -n $key ]] || die "this backup holds no seed key (made before backups carried it): its matches cannot be opened; take a new backup"
  drill_database "$name"
  docker exec -i "$name" pg_restore -U sbr -d sbr --no-owner --no-acl --exit-on-error <"$work/db.dump"
  counts=$(docker exec "$name" psql -U sbr -d sbr -tA -c \
    "SELECT (SELECT count(*) FROM sbr.schema_migrations) || ' migrations, ' || (SELECT count(*) FROM sbr.accounts) || ' accounts, ' || (SELECT count(*) FROM sbr.matches) || ' matches, ' || (SELECT count(*) FROM sbr.match_events) || ' events'")
  [[ -n $counts ]] || die "the drill restored nothing readable"
  # The app's own code (dist/cli.js check-seed-key) on the drill database's network; the
  # key travels in the environment, never on a command line another user could read.
  image=$(env_value "$SBR_ETC/$env.env" SBR_IMAGE)
  opened=$(SBR_SEED_KEY=$key docker run --rm --network "container:$name" -e SBR_SEED_KEY \
    -e DATABASE_URL=postgres://sbr:drill@127.0.0.1:5432/sbr "$image" node dist/cli.js check-seed-key) ||
    die "drill FAILED: the backup's seed key does not open its stored match secrets (message above)"
  info "drill passed: $counts; uploads $(tar -tf "$work/vol-sbr-${env}_uploads.tar" | wc -l) entries; $opened"
}

# install_backup_units <env>: the backup group, age, the systemd timer for 03:30 and the
# unit a failed backup starts (OnFailure=): it marks the failure for sbr status and logs it.
install_backup_units() {
  local env=$1
  getent group "$BACKUP_GROUP" >/dev/null || run groupadd --system "$BACKUP_GROUP"
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
Description=Seasonal Bingo Royale backup (%i) failed: mark it for sbr status

[Service]
Type=oneshot
ExecStart=/usr/bin/install -d -m 0700 /var/lib/sbr/%i
ExecStart=/bin/sh -c 'date -u +%%Y-%%m-%%dT%%H:%%M:%%SZ >/var/lib/sbr/%i/backup-failed'
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
