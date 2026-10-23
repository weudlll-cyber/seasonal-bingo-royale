#!/usr/bin/env bash
# @file   ops/lib/backup.sh
# @brief  Backups: pg_dump + uploads → age → /var/backups/sbr/<env>/, retention, restore, drill, timer.
#
# Responsibility: a backup is a tar of the database dump (pg_dump -Fc, inside the postgres
#                 container) and the uploads volume, encrypted with the operator's age public
#                 key (the server never holds the private key) and kept 14 daily and 8 weekly;
#                 a restore needs the operator's age identity file (--identity) and puts
#                 database and uploads back; a drill restores into a throw-away PostgreSQL
#                 container and counts the rows; the systemd timer runs the backup at 03:30.
# Used by:        ops/sbr, ops/install.sh (timer)
# Spec:           docs/spec/09-deployment-architecture.md §6; docs/spec/03-security-architecture.md §15

PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24

# do_backup <env>: prints the new file's path.
do_backup() {
  local env=$1 dir="$SBR_BACKUPS/$1" work stamp out recipient
  recipient=$(env_value "$SBR_ETC/$env.env" SBR_AGE_RECIPIENT)
  [[ -n $recipient ]] || die "no age public key in $SBR_ETC/$env.env (SBR_AGE_RECIPIENT)"
  command -v age >/dev/null || die "age is not installed (apt-get install age)"
  work=$(mktemp -d)
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  out="$dir/sbr-$env-$stamp.tar.age"
  compose "$env" exec -T postgres pg_dump -U sbr -Fc sbr >"$work/db.dump"
  compose "$env" exec -T app tar -C /data -cf - . >"$work/uploads.tar"
  install -d -m 0700 "$dir"
  tar -C "$work" -cf - db.dump uploads.tar | age -r "$recipient" >"$out"
  chmod 0600 "$out"
  rm -rf "$work"
  prune_backups "$dir"
  printf '%s\n' "$out"
}

# prune_backups <dir>: keeps the 14 newest, and the newest of each of the 8 newest weeks.
prune_backups() {
  local dir=$1 file week kept=0 weeks=() seen
  while IFS= read -r file; do
    kept=$((kept + 1))
    week=$(date -u -d "$(basename "$file" | sed -E 's/.*-([0-9]{8})T.*/\1/')" +%G%V)
    seen=0
    [[ " ${weeks[*]} " == *" $week "* ]] && seen=1
    if ((kept <= 14)); then
      ((seen)) || weeks+=("$week")
    elif ((seen == 0 && ${#weeks[@]} < 8)); then
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

# do_restore <env> <file> <identity>: replaces the database and the uploads.
do_restore() {
  local env=$1 work
  work=$(mktemp -d)
  unpack "$2" "$3" "$work"
  compose "$env" stop app
  compose "$env" exec -T postgres pg_restore -U sbr -d sbr --clean --if-exists --no-owner <"$work/db.dump"
  compose "$env" run --rm -T --no-deps --entrypoint sh app -c 'rm -rf /data/* && tar -C /data -xf -' <"$work/uploads.tar"
  compose "$env" start app
  rm -rf "$work"
  wait_ready "$env"
}

# do_drill <file> <identity>: restores into a throw-away database and counts what came back.
do_drill() {
  local work name="sbr-drill-$$" counts
  work=$(mktemp -d)
  unpack "$1" "$2" "$work"
  docker run -d --rm --name "$name" -e POSTGRES_USER=sbr -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=sbr "$PG_IMAGE" >/dev/null
  # Values expanded now: the trap runs after this function's locals are gone.
  # shellcheck disable=SC2064
  trap "docker rm -f '$name' >/dev/null 2>&1; rm -rf '$work'" RETURN
  until docker exec "$name" pg_isready -U sbr -d sbr >/dev/null 2>&1; do sleep 1; done
  sleep 2
  docker exec -i "$name" pg_restore -U sbr -d sbr --no-owner <"$work/db.dump"
  counts=$(docker exec "$name" psql -U sbr -d sbr -tA -c \
    "SELECT (SELECT count(*) FROM sbr.schema_migrations) || ' migrations, ' || (SELECT count(*) FROM sbr.accounts) || ' accounts, ' || (SELECT count(*) FROM sbr.matches) || ' matches, ' || (SELECT count(*) FROM sbr.match_events) || ' events'")
  [[ -n $counts ]] || die "the drill restored nothing readable"
  info "drill passed: $counts; uploads $(tar -tf "$work/uploads.tar" | wc -l) entries"
}

# install_backup_units <env>: the systemd timer for 03:30, and age for the encryption.
install_backup_units() {
  local env=$1
  command -v age >/dev/null || run apt-get install -y -q age
  put_file /etc/systemd/system/sbr-backup@.service 0644 <<'EOF'
[Unit]
Description=Seasonal Bingo Royale backup (%i)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/sbr/sbr backup %i
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
