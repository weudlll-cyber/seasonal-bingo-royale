#!/usr/bin/env bash
# @file   ops/pull-backups.sh
# @brief  Copies the server's encrypted backups to this computer (rsync over SSH).
#
# Responsibility: run on the operator's own Linux or macOS computer: fetch the backup files
#                 of one environment from /var/backups/sbr/<env>/ on the server that are not
#                 here yet into a local folder (default ~/sbr-backups/<env>). The files stay
#                 age-encrypted; only the operator's age key opens them. Windows:
#                 ops/pull-backups.ps1.
# Spec:           docs/spec/09-deployment-architecture.md §6; docs/operator-guide.md
#
# Usage: ops/pull-backups.sh <user@server> [prod|staging] [target folder]
set -euo pipefail

server=${1:?usage: pull-backups.sh <user@server> [prod|staging] [target folder]}
env=${2:-prod}
target=${3:-$HOME/sbr-backups/$env}
[[ $env =~ ^(prod|staging)$ ]] || {
  echo "The environment is prod or staging, not \"$env\"." >&2
  exit 1
}
mkdir -p "$target"
# --ignore-existing: a file once here is never fetched again.
rsync -av --ignore-existing --include='sbr-*.tar.age' --exclude='*' \
  "$server:/var/backups/sbr/$env/" "$target/"
echo "Backups of $env are in $target"
