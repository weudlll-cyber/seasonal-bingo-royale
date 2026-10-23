#!/usr/bin/env bash
# @file   ops/install.sh
# @brief  One-command install of Seasonal Bingo Royale on Ubuntu 24.04: standalone or inside the website.
#
# Responsibility: ask (or take from flags) the install type — standalone with its own domain
#                 and HTTPS, or integrated into the Seasonal Entertainment website on this
#                 server behind its proxy at /games/bingo — and the environment, address,
#                 admin e-mail, optional SMTP and the operator's age public key; check the
#                 system; install Docker when missing; build the app image from a git ref (no
#                 release image exists yet); write /etc/sbr/<env>.env with fresh secrets;
#                 start the stack (the app migrates the database on start) and wait for
#                 /readyz; install the backup timer; print the next steps. Re-running changes
#                 only what changed and never switches the type without confirmation.
# Depends on:     ops/lib/*.sh, ops/compose.yml, ops/compose.website.yml, ops/Caddyfile, ops/sbr
# Spec:           docs/spec/09-deployment-architecture.md §1–§3, §6, §8
#
# Usage: sudo bash ops/install.sh [--type standalone|website] [--env prod|staging]
#          [--address <domain or IP>] [--email <admin e-mail>] [--age-key <age1…>]
#          [--smtp-host h --smtp-port p --smtp-user u --smtp-password s --smtp-from f]
#          [--website-domain <domain>] [--repo <git url or path>] [--ref <git ref>]
#          [--yes] [--change-type] [--dry-run] [--any-os]
set -euo pipefail

OPS=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$OPS/lib/common.sh"
# shellcheck source=lib/host.sh
source "$OPS/lib/host.sh"
# shellcheck source=lib/website.sh
source "$OPS/lib/website.sh"
# shellcheck source=lib/config.sh
source "$OPS/lib/config.sh"
# shellcheck source=lib/backup.sh
source "$OPS/lib/backup.sh"

parse_flags() {
  while (($#)); do
    case $1 in
      --type) SBR_TYPE=$2; shift ;;
      --env) SBR_ENV=$2; shift ;;
      --address) SBR_ADDRESS=$2; shift ;;
      --email) SBR_ADMIN_EMAIL=$2; shift ;;
      --age-key) SBR_AGE_RECIPIENT=$2; shift ;;
      --smtp-host) SBR_SMTP_HOST=$2; shift ;;
      --smtp-port) SBR_SMTP_PORT=$2; shift ;;
      --smtp-user) SBR_SMTP_USER=$2; shift ;;
      --smtp-password) SBR_SMTP_PASSWORD=$2; shift ;;
      --smtp-from) SBR_SMTP_FROM=$2; shift ;;
      --website-domain) SBR_WEBSITE_DOMAIN=$2; shift ;;
      --repo) SBR_REPO=$2; shift ;;
      --ref) SBR_REF=$2; shift ;;
      --yes) SBR_YES=1 ;;
      --change-type) SBR_CHANGE_TYPE=1 ;;
      --dry-run) SBR_DRY_RUN=1 ;;
      --any-os) SBR_ANY_OS=1 ;;
      *) die "unknown option $1 (see the usage at the top of this script)" ;;
    esac
    shift
  done
}

# The type asked first; a re-run keeps it unless the change is confirmed.
choose_type() {
  local wanted=${SBR_TYPE:-} recorded=${RECORDED_TYPE:-} answer
  if [[ -z $wanted ]]; then
    wanted=$recorded
    [[ -n $wanted ]] || ask wanted "Install standalone (own domain, own HTTPS) or integrate into the Seasonal Entertainment website on this server? [standalone/website]" standalone
  fi
  [[ $wanted == standalone || $wanted == website ]] || die "the type is standalone or website, not \"$wanted\""
  if [[ -n $recorded && $wanted != "$recorded" && ${SBR_CHANGE_TYPE:-0} != 1 ]]; then
    [[ ${SBR_YES:-0} != 1 ]] || die "this server is installed as $recorded; pass --change-type to switch to $wanted"
    read -r -p "This server is installed as $recorded. Switch to $wanted? Type yes to confirm: " answer
    [[ $answer == yes ]] || die "kept $recorded; nothing changed"
  fi
  SBR_TYPE=$wanted
}

ask_common() {
  ask SBR_ENV "Environment [prod/staging]" prod
  [[ $SBR_ENV =~ ^(prod|staging)$ ]] || die "the environment is prod or staging"
  if [[ $SBR_TYPE == standalone ]]; then
    ask SBR_ADDRESS "Public address: the domain (bingo.example.org) or the server's IP"
  fi
  ask SBR_ADMIN_EMAIL "Admin e-mail (certificates and notices)"
  ask SBR_AGE_RECIPIENT "Your age public key for backups (age1…)"
  [[ $SBR_AGE_RECIPIENT == age1* ]] || die "an age public key starts with age1 (age-keygen prints it)"
  if [[ ${SBR_YES:-0} != 1 && -z ${SBR_SMTP_HOST:-} ]]; then
    read -r -p "SMTP server for e-mail (empty: none for now): " SBR_SMTP_HOST
    if [[ -n $SBR_SMTP_HOST ]]; then
      ask SBR_SMTP_PORT "SMTP port" 587
      ask SBR_SMTP_USER "SMTP user"
      read -r -s -p "SMTP password: " SBR_SMTP_PASSWORD && echo
      ask SBR_SMTP_FROM "Sender address" "$SBR_ADMIN_EMAIL"
    fi
  fi
}

# Where the source comes from: this checkout's origin and branch, else the public repository.
default_source() {
  local origin branch
  origin=$(git -C "$OPS" remote get-url origin 2>/dev/null || true)
  branch=$(git -C "$OPS" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  SBR_REPO=${SBR_REPO:-${origin:-https://github.com/weudlll-cyber/seasonal-bingo-royale.git}}
  [[ $branch == HEAD ]] && branch=''
  SBR_REF=${SBR_REF:-${branch:-feat/vps-install}}
  info "  image source: built on this server from $SBR_REPO at $SBR_REF (no signed release image yet)"
}

next_steps() {
  info ""
  info "Done ($SBR_CHANGES change(s)). Next steps:"
  info "  1. Create the first admin:  sudo sbr admin create-super"
  if [[ $SBR_TYPE == standalone ]]; then
    info "  2. Open https://$SBR_ADDRESS/"
    [[ $SBR_ADDRESS =~ ^[0-9.]+$|: ]] && warn "with an IP address the certificate comes from Caddy's own CA: browsers warn until you point a domain here and re-run with --address <domain>"
    info "  3. Firewall: allow 22, 80 and 443 only (docs/operator-guide.md)."
  else
    info "  2. $(snippet_steps)"
    info "  3. Players use bingo's own accounts for now (the shared website login comes later)."
  fi
  info "  Backups run every night at 03:30 into $SBR_BACKUPS/$SBR_ENV/; pull them to your PC with ops/pull-backups.ps1."
  info "  Status: sudo sbr status"
}

main() {
  parse_flags "$@"
  [[ $SBR_DRY_RUN == 1 || $EUID -eq 0 ]] || die "run as root: sudo bash $0"
  [[ $SBR_DRY_RUN == 1 ]] && info "DRY RUN: nothing is changed, every step is shown."
  RECORDED_TYPE=''
  if [[ -f $SBR_ETC/install.conf ]]; then
    RECORDED_TYPE=$(sed -n 's/^SBR_TYPE=//p' "$SBR_ETC/install.conf")
    SBR_ENV=${SBR_ENV:-$(sed -n 's/^SBR_ENV=//p' "$SBR_ETC/install.conf")}
    SBR_ADDRESS=${SBR_ADDRESS:-$(sed -n 's/^SBR_ADDRESS=//p' "$SBR_ETC/install.conf")}
  fi
  info "Checking the server"
  check_os
  check_resources
  install_prereqs
  choose_type
  ask_common
  install_docker
  if [[ $SBR_TYPE == standalone ]]; then check_ports "$SBR_ENV"; else detect_website; fi
  info "Preparing the app"
  default_source
  build_image "$SBR_REPO" "$SBR_REF"
  write_env "$SBR_ENV"
  write_record
  install_files "$OPS"
  [[ $SBR_TYPE == website ]] && write_snippet "$SBR_ENV"
  info "Starting the stack"
  run compose "$SBR_ENV" up -d --remove-orphans
  [[ $SBR_DRY_RUN == 1 ]] || wait_ready "$SBR_ENV"
  # A changed Caddyfile takes effect without a restart; an unchanged one changes nothing.
  if [[ $SBR_TYPE == standalone ]]; then
    run compose "$SBR_ENV" exec -T caddy caddy reload --config /etc/caddy/Caddyfile
  fi
  install_backup_units "$SBR_ENV"
  next_steps
}

main "$@"
