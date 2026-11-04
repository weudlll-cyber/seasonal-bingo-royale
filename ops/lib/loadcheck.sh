#!/usr/bin/env bash
# @file   ops/lib/loadcheck.sh
# @module ops
# @brief  sbr loadcheck: one realtime royale with temporary players and spectators on this install, measured.
#
# Responsibility: refuse with the reason while real players are in a match that is not over, or
#                 while maintenance is off and people are signed in (the app's CLI decides); make
#                 the temporary accounts and their sessions through the operator-only CLI inside
#                 the app container (never an HTTP route; the cookies stay in a root-only work
#                 folder and reach the generator on its standard input); run the load generator
#                 (dist/loadcheck.js of the same image) in a short-lived container on the stack's
#                 internal network against the app's own port, one royale with draws every 4 s,
#                 taps inside the speed window and the spectators; sample the app's and
#                 PostgreSQL's CPU and memory with docker stats; print the measures with the
#                 peaks; then abort the match and remove every load account and session, and
#                 verify it (the CLI's cleanup, also when the run failed: ./common.sh runs it on
#                 exit). The game's resource limits stay as they are.
# Depends on:     ./common.sh (compose, env_value, cleanup_path, cleanup_container, die, info),
#                 docker
# Used by:        ops/sbr
# Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/09-deployment-architecture.md §4

# loadcheck_stats <env> <work dir>: one docker stats line per container every 2 s while
# <work dir>/run exists.
loadcheck_stats() {
  local names=("sbr-$1-app-1" "sbr-$1-postgres-1")
  while [[ -f $2/run ]]; do
    docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' "${names[@]}" \
      >>"$2/stats.txt" 2>/dev/null || true
    sleep 2
  done
}

# loadcheck_peaks <stats file> <container>: "<CPUs> CPUs / <MiB> MiB" at their peaks.
loadcheck_peaks() {
  awk -v name="$2" '$1 == name {
      cpu = $2; sub(/%/, "", cpu); cpu += 0; if (cpu > maxc) maxc = cpu
      mem = $3; unit = mem; gsub(/[0-9.]/, "", unit); sub(/[A-Za-z]+$/, "", mem); mem += 0
      if (unit == "GiB") mem *= 1024; else if (unit == "KiB") mem /= 1024; else if (unit == "B") mem /= 1048576
      if (mem > maxm) maxm = mem
    } END { printf "%.2f CPUs / %d MiB", maxc / 100, maxm }' "$1"
}

# loadcheck_options <args…>: sets LC_PLAYERS, LC_SPECTATORS, LC_MINUTES, LC_CPUSET, checked.
loadcheck_options() {
  LC_PLAYERS=200 LC_SPECTATORS=50 LC_MINUTES=10 LC_CPUSET=''
  while (($#)); do
    case $1 in
      --players) LC_PLAYERS=${2:-} && shift ;;
      --spectators) LC_SPECTATORS=${2:-} && shift ;;
      --minutes) LC_MINUTES=${2:-} && shift ;;
      --cpuset) LC_CPUSET=${2:-} && shift ;;
      *) die "unknown option $1 (--players N, --spectators M, --minutes T, --cpuset CPUS)" ;;
    esac
    shift
  done
  [[ $LC_PLAYERS =~ ^[0-9]+$ ]] && ((LC_PLAYERS >= 2 && LC_PLAYERS <= 200)) || die "--players: 2 to 200"
  [[ $LC_SPECTATORS =~ ^[0-9]+$ ]] && ((LC_SPECTATORS <= 200)) || die "--spectators: 0 to 200"
  [[ $LC_MINUTES =~ ^[0-9]+$ ]] && ((LC_MINUTES >= 1 && LC_MINUTES <= 60)) || die "--minutes: 1 to 60"
  [[ -z $LC_CPUSET || $LC_CPUSET =~ ^[0-9]+([,-][0-9]+)*$ ]] || die "--cpuset: CPU numbers, e.g. 6-7"
}

# cmd_loadcheck <env> [--players N] [--spectators M] [--minutes T] [--cpuset CPUS]: --cpuset
# pins the generator to those CPUs (instead of capping it at 2), so its own work does not
# count as the game's.
cmd_loadcheck() {
  local env=$1 file="$SBR_ETC/$1.env" work origin base name rc=0 cpus=(--cpus 2)
  shift
  loadcheck_options "$@"
  [[ -z $LC_CPUSET ]] || cpus=(--cpuset-cpus "$LC_CPUSET")
  compose "$env" exec -T app node dist/cli.js loadcheck preflight ||
    die "the load check does not run now (the reason is above)"
  work=$(mktemp -d)
  cleanup_path "$work"
  SBR_LOADCHECK_ENV=$env
  # What an earlier run could not remove goes first.
  compose "$env" exec -T app node dist/cli.js loadcheck cleanup >/dev/null
  info "Making $LC_PLAYERS players and $LC_SPECTATORS spectators (temporary accounts)"
  (umask 077 && compose "$env" exec -T app node dist/cli.js loadcheck accounts \
    --players "$LC_PLAYERS" --spectators "$LC_SPECTATORS" >"$work/accounts.json")
  origin=$(env_value "$file" SBR_PUBLIC_URL | sed -E 's#^(https?://[^/]+).*#\1#')
  base=$(env_value "$file" SBR_BASE_PATH)
  name="sbr-loadcheck-$$"
  touch "$work/run"
  loadcheck_stats "$env" "$work" &
  info "One realtime royale for at most $LC_MINUTES minutes (draws every 4 s; the game's limits apply)"
  cleanup_container "$name"
  docker run --name "$name" --rm -i --network "sbr-${env}_data" --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 1g "${cpus[@]}" \
    -e SBR_LOAD_BASE="http://app:3000${base%/}" -e SBR_LOAD_ORIGIN="$origin" \
    "$(env_value "$file" SBR_IMAGE)" node dist/loadcheck.js "$LC_MINUTES" <"$work/accounts.json" || rc=$?
  rm -f "$work/run"
  wait
  info "$(printf '%-28s %s' 'app peak' "$(loadcheck_peaks "$work/stats.txt" "sbr-$env-app-1")")  [criterion memory < 600 MiB]"
  info "$(printf '%-28s %s' 'PostgreSQL peak' "$(loadcheck_peaks "$work/stats.txt" "sbr-$env-postgres-1")")"
  compose "$env" exec -T app node dist/cli.js loadcheck cleanup
  SBR_LOADCHECK_ENV=''
  ((rc == 0)) || die "the load generator stopped with an error (above); its accounts are removed"
}
