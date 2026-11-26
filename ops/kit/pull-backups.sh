#!/usr/bin/env bash
# @file   ops/pull-backups.sh
# @module ops
# @brief  Copies a server's encrypted backups to this computer (rsync over SSH).
#
# Responsibility: run on the operator's own Linux or macOS computer: fetch the backup files of
#                 one game that are not here yet from the folder ops/backup.sh writes on the
#                 server into a local folder, as a user in the backup group (no root login).
#                 rsync writes each file under a temporary name and renames it when complete, so
#                 a cut-off copy never counts; no backup on the server yet is a plain message.
#                 The files stay age-encrypted; only the operator's age key opens them.
#                 Windows: ops/pull-backups.ps1.
# Source:         seasonal-bingo-royale ops/pull-backups.sh at dd35d08 and seasonal-mini-games
#                 ops/pull-backups.sh at 1988346 (the same 36 lines but for the prefix and the
#                 folder, which are arguments here).
# Spec:           kit DECISIONS K61; docs/OPERATIONS.md
#
# Usage: ops/pull-backups.sh <user@server> <remote folder> <prefix> [target folder]
set -euo pipefail

server=${1:?usage: pull-backups.sh <user@server> <remote folder> <prefix> [target folder]}
remote=${2:?usage: pull-backups.sh <user@server> <remote folder> <prefix> [target folder]}
prefix=${3:?usage: pull-backups.sh <user@server> <remote folder> <prefix> [target folder]}
target=${4:-$HOME/$prefix-backups}
[[ $prefix =~ ^[A-Za-z0-9_-]+$ ]] || {
  echo "The prefix is letters, digits, - and _, not \"$prefix\"." >&2
  exit 1
}
[[ $remote =~ ^/[A-Za-z0-9_./-]+$ ]] || {
  echo "The remote folder is an absolute path of plain characters, not \"$remote\"." >&2
  exit 1
}
mkdir -p "$target"
# The folder appears with the first backup; an SSH failure stops here (set -e).
# shellcheck disable=SC2029 # $remote is checked above and is meant to expand here
found=$(ssh "$server" "test -d $remote && echo yes || echo no")
if [[ $found == no ]]; then
  echo "No backups on $server yet (the first runs with the timer, or run ops/backup.sh backup)."
  exit 0
fi
# --ignore-existing: a file once here is never fetched again.
rsync -av --ignore-existing --include="$prefix-*.tar.age" --exclude='*' "$server:$remote/" "$target/"
echo "Backups of $prefix are in $target"
