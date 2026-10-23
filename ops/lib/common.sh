#!/usr/bin/env bash
# @file   ops/lib/common.sh
# @brief  Shared helpers of ops/install.sh and ops/sbr: messages, questions, files, compose.
#
# Responsibility: plain messages (info, warn, die), a question that takes a flag value or
#                 asks (never in --yes mode), running a command or only showing it
#                 (--dry-run), writing a file only when its content changed (so a second
#                 install run changes nothing and says so), reading the install record
#                 /etc/sbr/install.conf, and running Docker Compose for one environment
#                 with the right files and env file.
# Used by:        ops/install.sh, ops/sbr
# Spec:           docs/spec/09-deployment-architecture.md §2–§4

SBR_ROOT=${SBR_ROOT:-/opt/sbr}
SBR_ETC=${SBR_ETC:-/etc/sbr}
SBR_BACKUPS=${SBR_BACKUPS:-/var/backups/sbr}
SBR_CHANGES=0
SBR_DRY_RUN=${SBR_DRY_RUN:-0}

info() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() {
  printf 'STOP: %s\n' "$*" >&2
  exit 1
}

# ask <variable> <question> [default]: keeps a value already set (from a flag or the install
# record); otherwise asks, or takes the default; in --yes mode a missing answer stops.
ask() {
  local var=$1 question=$2 default=${3:-} answer
  if [[ -n ${!var:-} ]]; then return 0; fi
  if [[ ${SBR_YES:-0} == 1 ]]; then
    [[ -n $default ]] || die "missing answer for: $question (pass it as a flag)"
    printf -v "$var" '%s' "$default"
    return 0
  fi
  read -r -p "$question${default:+ [$default]}: " answer
  printf -v "$var" '%s' "${answer:-$default}"
}

# run <command…>: runs it, or in --dry-run mode only shows it.
run() {
  if [[ $SBR_DRY_RUN == 1 ]]; then
    info "  would run: $*"
    return 0
  fi
  "$@"
}

# put_file <target> <mode>: writes standard input to <target> only when it differs.
put_file() {
  local target=$1 mode=$2 tmp
  tmp=$(mktemp)
  cat >"$tmp"
  if [[ -f $target ]] && cmp -s "$tmp" "$target"; then
    rm -f "$tmp"
    return 0
  fi
  SBR_CHANGES=$((SBR_CHANGES + 1))
  if [[ $SBR_DRY_RUN == 1 ]]; then
    info "  would write $target ($(wc -l <"$tmp") lines, mode $mode)"
  else
    install -D -m "$mode" "$tmp" "$target"
    info "  wrote $target"
  fi
  rm -f "$tmp"
}

# The install record: type, environment, address and git ref of the last install run.
load_record() {
  local file="$SBR_ETC/install.conf"
  [[ -f $file ]] || return 1
  # shellcheck disable=SC1090
  source "$file"
}

# compose <env> <args...>: Docker Compose for one environment (project sbr-<env>).
compose() {
  local env=$1
  shift
  local files=(-f "$SBR_ROOT/compose.yml")
  local type
  type=$(sed -n 's/^SBR_INSTALL_TYPE=//p' "$SBR_ETC/$env.env")
  if [[ $type == website ]]; then
    files+=(-f "$SBR_ROOT/compose.website.yml")
  else
    files+=(--profile standalone)
  fi
  docker compose -p "sbr-$env" --project-directory "$SBR_ROOT" \
    --env-file "$SBR_ETC/$env.env" "${files[@]}" "$@"
}

# wait_ready <env>: waits up to 3 minutes for the app's /readyz inside the container.
wait_ready() {
  local env=$1 i
  for i in $(seq 1 90); do
    if compose "$env" exec -T app wget -qO- http://127.0.0.1:3000/readyz >/dev/null 2>&1; then
      info "  the app is ready (after ${i}x2 s)"
      return 0
    fi
    sleep 2
  done
  die "the app did not become ready within 3 minutes (sbr logs app)"
}
