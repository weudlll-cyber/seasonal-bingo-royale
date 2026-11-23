# shellcheck shell=bash
# @file   ops/test/real-site-drill.sh
# @module ops/test
# @brief  The rehearsal's backup-and-restore drill: a backup of the played server, restored
#         into a fresh server (sourced by ./real-site.sh).
#
# Responsibility: drill_backup, on the rehearsal's server after its update: one recovery code stored
#                 for a member as the game stores them (HMAC-SHA-256 under SBR_RECOVERY_KEY), a
#                 fingerprint of the data tables, `sbr backup`, and the backup and the age key taken
#                 out to the host. drill_restore, after the uninstall: a fresh server with website
#                 and bingo installed again, `sbr restore <backup> --identity <key> --force-env` (as
#                 the operator guide says), then the same fingerprint, the backup's recovery key,
#                 the code checked by the app (check-recovery-code), the seed key opening a restored
#                 match, the played match, the website's checks, `sbr status`.
# Depends on:     ./real-site.sh (on_server, ok, probe, say, website_server, copy_bingo,
#                 bingo_install, bingo_status, website_checks, admin, state_value, $STATE),
#                 docker, openssl in the server
# Used by:        ./real-site.sh (DRILL=0 skips it)
# Spec:           docs/operator-guide.md (backups, a real restore); docs/spec/09-deployment-architecture.md §6

DRILL_DB=sbr-prod-postgres-1
DRILL_APP=sbr-prod-app-1
DRILL_MEMBER=watcher1

# The data the restore must bring back, one line per table: name, rows, a hash of all rows.
DRILL_TABLES=(accounts external_identities role_assignments matches match_entries match_events
  marks standings league_entries league_awards league_corrections leaderboard_periods
  badges_awarded settings_documents settings_versions audit_log recovery_codes website_deleted)

drill_sql() { on_server docker exec -i "$DRILL_DB" psql -U sbr -d sbr -tA -v ON_ERROR_STOP=1 -c "$1"; }

drill_print() {
  local table sql=''
  for table in "${DRILL_TABLES[@]}"; do
    [[ -z $sql ]] || sql+=' UNION ALL '
    sql+="SELECT '$table' || ' ' || count(*) || ' ' || md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) FROM sbr.$table t"
  done
  drill_sql "$sql"
}

# The install's recovery key as a hash (the key itself is never printed); the env file may
# quote a value ('…', ops/lib/common.sh env_value), \047 is that quote. These lines expand in
# the server's shell, not here.
# shellcheck disable=SC2016
DRILL_KEY='key=$(sed -n "s/^SBR_RECOVERY_KEY=//p" /etc/sbr/prod.env | tr -d "\047")'
# shellcheck disable=SC2016
recovery_print() { on_server sh -c "$DRILL_KEY"' && printf %s "$key" | sha256sum'; }

# A recovery code for the member, stored as the game stores one (kit recoveryHash, 'hex').
drill_store_code() {
  local hash
  DRILL_CODE=$(openssl rand -hex 5)
  # shellcheck disable=SC2016
  hash=$(printf '%s' "$DRILL_CODE" | on_server sh -c "$DRILL_KEY"' &&
    openssl dgst -sha256 -mac HMAC -macopt "hexkey:$key" -r | cut -d" " -f1')
  test "$(drill_sql "WITH i AS (INSERT INTO sbr.recovery_codes (account_id, code_hash)
    SELECT id, decode('$hash', 'hex') FROM sbr.accounts WHERE display_name_key = '$DRILL_MEMBER'
    RETURNING 1) SELECT count(*) FROM i")" = 1
}

# The code on standard input to the app's own check, never on a command line.
drill_code_works() {
  printf '%s\n' "$DRILL_CODE" |
    on_server docker exec -i "$DRILL_APP" node dist/cli.js check-recovery-code --name "$DRILL_MEMBER"
}

drill_backup() {
  say "--- the drill: a backup of this server"
  probe ok "a recovery code stored for $DRILL_MEMBER" drill_store_code
  DRILL_PRINT=$(drill_print)
  printf '%s\n' "$DRILL_PRINT" | sed 's/^/    /' >>"$RESULTS"
  DRILL_RECOVERY=$(recovery_print)
  probe ok "sbr backup" on_server sbr --yes backup
  DRILL_FILE=$(on_server sh -c 'ls -t /var/backups/sbr/prod/sbr-prod-*.tar.age | head -n 1')
  on_server cat "$DRILL_FILE" >"$STATE/drill.tar.age"
  on_server cat /etc/seasonal-test/age-key.txt >"$STATE/drill-age-key.txt"
  ok "the backup was taken out of the server" test -s "$STATE/drill.tar.age"
}

drill_restore() {
  local name
  say "--- the drill: the backup restored into a fresh server"
  stop_server
  website_server
  copy_bingo
  probe bingo_install
  ok "the fresh install made its own recovery key" test "$(recovery_print)" != "$DRILL_RECOVERY"
  name=$(basename "$DRILL_FILE")
  on_server sh -c "cat >/root/$name" <"$STATE/drill.tar.age"
  on_server sh -c 'umask 077 && cat >/root/drill-age-key.txt' <"$STATE/drill-age-key.txt"
  probe ok "sbr restore --force-env (a new server has its own seed key)" \
    on_server sbr --yes restore "/root/$name" --identity /root/drill-age-key.txt --force-env
  drill_checks
}

drill_checks() {
  local now table
  now=$(drill_print)
  printf '%s\n' "$now" | sed 's/^/    /' >>"$RESULTS"
  for table in "${DRILL_TABLES[@]}"; do
    ok "restored: $table" test "$(grep "^$table " <<<"$now")" = "$(grep "^$table " <<<"$DRILL_PRINT")"
  done
  ok "the settings History came back (versions stored)" test "$(drill_sql 'SELECT count(*) > 0 FROM sbr.settings_versions')" = t
  ok "the backup's recovery key is the server's" test "$(recovery_print)" = "$DRILL_RECOVERY"
  ok "the stored recovery code still works (the app's check)" drill_code_works
  ok "the backup's seed key opens a restored match" \
    grep -q 'opens the newest sealed match seed' <<<"$(on_server docker exec "$DRILL_APP" node dist/cli.js check-seed-key 2>&1)"
  admin admin-login
  ok "the played match is there, finished, through the game" test "$(admin status admin "$(state_value play)")" = finished
  probe website_checks
  probe bingo_status
}
