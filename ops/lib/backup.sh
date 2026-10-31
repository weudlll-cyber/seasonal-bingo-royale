#!/usr/bin/env bash
# @file   ops/lib/backup.sh
# @module ops
# @brief  Backups: pg_dump + uploads + seed key → age → /var/backups/sbr/<env>/, retention, restore, drill, timer.
#
# Responsibility: a backup tars the database dump (pg_dump -Fc in the postgres container), the
#                 uploads volume minus the maintenance flag (via a helper container) and the env
#                 file's SBR_SEED_KEY (sealed secrets need it), age-encrypted to the operator's
#                 public key, written .partial then renamed, group sbr-backup; keeps the 14 newest
#                 plus the newest of 8 older weeks. A restore needs the age identity, refuses
#                 another env's backup or seed key unless --force-env, asks, stops the app,
#                 restores in one transaction; a drill uses a throw-away PostgreSQL, opens one
#                 sealed seed. Timer 03:30; failures mark backup-failed.
# Depends on:     ./common.sh (compose, run, put_file, env_value, set_env_value, confirm,
#                 cleanup, stop_app), age, docker
# Used by:        ops/sbr, ops/install.sh (timer)
# Spec:           docs/spec/09-deployment-architecture.md §6; docs/spec/03-security-architecture.md §15

PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
BACKUP_GROUP=sbr-backup

# do_backup <env>: sets BACKUP_FILE to the new file (runs in this shell, so errors stop it).
do_backup() {
  local env=$1 dir="$SBR_BACKUPS/$1" work stamp out recipient image seed
  recipient=$(env_value "$SBR_ETC/$env.env" SBR_AGE_RECIPIENT)
  image=$(env_value "$SBR_ETC/$env.env" SBR_IMAGE)
  seed=$(env_value "$SBR_ETC/$env.env" SBR_SEED_KEY)
  [[ -n $recipient ]] || die "no age public key in $SBR_ETC/$env.env (SBR_AGE_RECIPIENT)"
  [[ -n $seed ]] || die "no SBR_SEED_KEY in $SBR_ETC/$env.env: without it no backup can be opened again"
  command -v age >/dev/null || die "age is not installed (apt-get install age)"
  work=$(mktemp -d)
  cleanup_path "$work"
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  out="$dir/sbr-$env-$stamp.tar.age"
  compose "$env" exec -T postgres pg_dump -U sbr -Fc sbr >"$work/db.dump"
  # The maintenance flag is the live state, not data: a restore must not bring it back (audit M3).
  docker run --rm --entrypoint tar -v "sbr-${env}_uploads:/data:ro" "$image" \
    -C /data --exclude=./maintenance -cf - . >"$work/uploads.tar"
  # Only the seed key of the env file travels with the backup (inside the encryption).
  printf '%s\n' "$seed" >"$work/seed.key"
  install -d -m 0750 -g "$BACKUP_GROUP" "$SBR_BACKUPS" "$dir"
  cleanup_path "$out.partial"
  tar -C "$work" -cf - db.dump uploads.tar seed.key | age -r "$recipient" >"$out.partial"
  chgrp "$BACKUP_GROUP" "$out.partial"
  chmod 0640 "$out.partial"
  mv "$out.partial" "$out"
  prune_backups "$dir"
  rm -f "$SBR_STATE/$env/backup-failed"
  # shellcheck disable=SC2034 # read by ops/sbr after the call
  BACKUP_FILE=$out
}

# prune_backups <dir>: keeps the 14 newest (daily), and of the older ones the newest of each
# week for 8 weeks (weekly, counted apart from the dailies).
prune_backups() {
  local dir=$1 file week kept=0 weeks=()
  while IFS= read -r file; do
    kept=$((kept + 1))
    ((kept <= 14)) && continue
    week=$(date -u -d "$(basename "$file" | sed -E 's/.*-([0-9]{8})T.*/\1/')" +%G%V)
    if [[ " ${weeks[*]} " != *" $week "* && ${#weeks[@]} -lt 8 ]]; then
      weeks+=("$week")
    else
      rm -f "$file"
    fi
  done < <(find "$dir" -maxdepth 1 -name 'sbr-*.tar.age' | sort -r)
}

# unpack <file> <identity> <dir>: decrypts (when .age) and unpacks a backup into <dir>.
unpack() {
  local file=$1 identity=$2 dir=$3
  if [[ $file == *.age ]]; then
    [[ -n $identity ]] || die "this backup is encrypted: pass your age key file with --identity <file>"
    age -d -i "$identity" "$file" | tar -C "$dir" -xf -
  else
    tar -C "$dir" -xf "$file"
  fi
  [[ -s $dir/db.dump ]] || die "no database dump in $file"
}

# backup_seed_key <dir>: the seed key of an unpacked backup, or nothing (made before backups carried it).
backup_seed_key() {
  [[ -f $1/seed.key ]] || return 0
  tr -d '[:space:]' <"$1/seed.key"
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
  unpack "$file" "$3" "$work"
  choose_seed_key "$env" "$(backup_seed_key "$work")" "$4"
  confirm "Restore $(basename "$file") over the live $env data? Everything since that backup is lost."
  stop_app "$env"
  restore_database "$env" "$work/db.dump"
  restore_uploads "$env" "$work/uploads.tar"
  if [[ $RESTORE_SEED_KEY != "$(env_value "$SBR_ETC/$env.env" SBR_SEED_KEY)" ]]; then
    set_env_value "$SBR_ETC/$env.env" SBR_SEED_KEY "$RESTORE_SEED_KEY"
  fi
  # up, not start: a changed env file (the seed key) recreates the app container.
  compose "$env" up -d
  restart_app_done
  wait_ready "$env"
}

# restore_database <env> <dump>: drops the schema and restores the dump in ONE transaction,
# so the live data goes only when the restore succeeded (audit H3). pg_restore turns the dump
# into SQL; psql runs BEGIN, the DROP, that SQL and COMMIT, and stops at the first error
# (ON_ERROR_STOP), which rolls the DROP back too. COMMIT is sent only after pg_restore
# succeeded (&&, so also where set -e does not act): a dump it cannot read ends the input
# without COMMIT, the open transaction is rolled back when psql disconnects, and pipefail
# returns the failure.
restore_database() {
  {
    printf 'SET client_min_messages = warning;\nBEGIN;\nDROP SCHEMA IF EXISTS sbr CASCADE;\n'
    compose "$1" exec -T postgres pg_restore --no-owner -f - <"$2" && printf 'COMMIT;\n'
  } | compose "$1" exec -T postgres psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -U sbr -d sbr
}

# restore_uploads <env> <tar>: replaces the uploads. The maintenance flag is the live state:
# it stays as it is, also when an older backup still holds one (audit M3).
restore_uploads() {
  compose "$1" run --rm -T --no-deps --entrypoint sh app -c \
    'find /data -mindepth 1 -maxdepth 1 ! -name maintenance -exec rm -rf {} + && tar -C /data --exclude=./maintenance -xf -' <"$2"
}

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

# do_drill <env> <file> <identity>: restores into a throw-away database, counts what came
# back and opens one stored sealed seed with the backup's seed key.
do_drill() {
  local env=$1 work name="sbr-drill-$$" counts key image opened
  work=$(mktemp -d)
  cleanup_path "$work"
  unpack "$2" "$3" "$work"
  key=$(backup_seed_key "$work")
  [[ -n $key ]] || die "this backup holds no seed key (made before backups carried it): its matches cannot be opened; take a new backup"
  drill_database "$name"
  docker exec -i "$name" pg_restore -U sbr -d sbr --no-owner --exit-on-error <"$work/db.dump"
  counts=$(docker exec "$name" psql -U sbr -d sbr -tA -c \
    "SELECT (SELECT count(*) FROM sbr.schema_migrations) || ' migrations, ' || (SELECT count(*) FROM sbr.accounts) || ' accounts, ' || (SELECT count(*) FROM sbr.matches) || ' matches, ' || (SELECT count(*) FROM sbr.match_events) || ' events'")
  [[ -n $counts ]] || die "the drill restored nothing readable"
  # The app's own code (dist/cli.js check-seed-key) on the drill database's network; the
  # key travels in the environment, never on a command line another user could read.
  image=$(env_value "$SBR_ETC/$env.env" SBR_IMAGE)
  opened=$(SBR_SEED_KEY=$key docker run --rm --network "container:$name" -e SBR_SEED_KEY \
    -e DATABASE_URL=postgres://sbr:drill@127.0.0.1:5432/sbr "$image" node dist/cli.js check-seed-key) ||
    die "drill FAILED: the backup's seed key does not open its stored match secrets (message above)"
  info "drill passed: $counts; uploads $(tar -tf "$work/uploads.tar" | wc -l) entries; $opened"
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
