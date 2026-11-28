#!/usr/bin/env bash
# @file   ops/lib/host-baseline.sh
# @module ops
# @brief  The security a standalone game's server gets: firewall, automatic security updates and a
#         fail2ban jail for SSH, each added only where it is missing.
#
# Responsibility: sourced by a game's installer, which runs as root on Ubuntu 24.04.
#                 `sk_host_baseline <standalone|website>`. In website mode the website's installer
#                 owns the host: it says so and changes nothing. Standalone, it only adds, never
#                 removes: it allows the ports sshd really uses (read from `sshd -T`, never
#                 assumed, and the port of the operator's own connection), 80 and 443, then turns
#                 the firewall (ufw) on; turns on automatic security updates
#                 (unattended-upgrades); adds a fail2ban jail for SSH on those ports. Without an
#                 SSH port, or when a rule cannot be added, the firewall is not turned on. A step
#                 already in place is said and left. The SSH server's configuration is never
#                 changed (a wrong change locks the owner out): what it allows is only reported.
#                 Settings for tests: SK_HOST_APT_CONF, SK_HOST_JAIL_DIR.
# Depends on:     bash 4, apt-get, dpkg-query, apt-config, ufw, systemctl, sshd
# Source:         seasonal-entertainment deploy/install/lib/firewall.sh (ufw's own answer decides
#                 whether a rule was added) and packages.sh (apt without questions, never an
#                 upgrade) at 10c4619. New: finding the SSH port, turning ufw on, the updates and
#                 the jail, which the games' operator guides describe as manual steps.
# Spec:           kit DECISIONS K88; docs/OPERATIONS.md "The host baseline"

sk_host_say() { printf 'host: %s\n' "$*"; }
sk_host_die() {
  printf 'host baseline: %s\n' "$*" >&2
  return 1
}

# apt without questions: needrestart only lists, so no service restarts in the middle of a run.
sk_host_apt() { DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get "$@"; }

sk_host_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }

# Installs the package when missing; an installed one is never upgraded.
sk_host_package() {
  if sk_host_installed "$1"; then return 0; fi
  sk_host_say "installing $1"
  [[ -n ${SK_HOST_APT_UPDATED:-} ]] || sk_host_apt update -qq || { sk_host_die "apt-get update failed"; return 1; }
  SK_HOST_APT_UPDATED=1
  sk_host_apt install -y -q --no-upgrade --no-install-recommends "$1" >/dev/null ||
    { sk_host_die "could not install $1"; return 1; }
}

# The SSH server's effective settings, as it reads them itself.
sk_host_sshd() { sshd -T 2>/dev/null; }

# The ports SSH uses, one per line: every `port` of `sshd -T`, and the one the operator is
# connected on now (when sudo keeps SSH_CONNECTION: "client port server port").
sk_host_ssh_ports() {
  local config now
  config=$(sk_host_sshd) || return 1
  now=${SSH_CONNECTION:-}
  {
    sed -n 's/^port \([0-9]\{1,5\}\)$/\1/p' <<<"$config"
    [[ ! ${now##* } =~ ^[0-9]{1,5}$ ]] || printf '%s\n' "${now##* }"
  } | sort -un
}

# ufw's own answer says whether the rule was new.
sk_host_allow() {
  local said
  said=$(ufw allow "$1" 2>&1) || { sk_host_die "ufw allow $1 failed: $said"; return 1; }
  if [[ $said == *Skipping* ]]; then
    sk_host_say "firewall: $1 is already allowed"
  else
    sk_host_say "firewall: allowed $1"
  fi
}

sk_host_firewall() {
  local port ports=$1
  sk_host_package ufw || return 1
  # SSH first: the firewall is never turned on before the way in is allowed.
  for port in $ports 80 443; do
    sk_host_allow "$port/tcp" || { sk_host_die "the firewall was not turned on"; return 1; }
  done
  if ufw status 2>/dev/null | grep -q '^Status: active'; then
    sk_host_say "firewall: already on"
  else
    ufw --force enable >/dev/null || { sk_host_die "ufw could not be turned on"; return 1; }
    sk_host_say "firewall: turned on; other incoming connections are refused"
  fi
}

sk_host_updates() {
  local conf=${SK_HOST_APT_CONF:-/etc/apt/apt.conf.d}
  sk_host_package unattended-upgrades || return 1
  if apt-config dump APT::Periodic::Unattended-Upgrade 2>/dev/null | grep -q '"1"'; then
    sk_host_say "automatic security updates: already on"
    return 0
  fi
  # A file of its own, read after the others: nothing of the server's is rewritten.
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' \
    >"$conf/52seasonal-auto-upgrades" || { sk_host_die "cannot write $conf/52seasonal-auto-upgrades"; return 1; }
  sk_host_say "automatic security updates: turned on"
}

sk_host_jail() {
  local dir=${SK_HOST_JAIL_DIR:-/etc/fail2ban/jail.d} file wanted list
  sk_host_package fail2ban || return 1
  list=$(paste -sd, <<<"$1")
  file=$dir/seasonal-sshd.conf
  # The journal is where Ubuntu 24.04 logs SSH.
  wanted=$(printf '[sshd]\nenabled = true\nbackend = systemd\nport = %s' "$list")
  if [[ -f $file && $(<"$file") == "$wanted" ]]; then
    sk_host_say "fail2ban: the SSH jail is already in place (port $list)"
    return 0
  fi
  printf '%s\n' "$wanted" >"$file" || { sk_host_die "cannot write $file"; return 1; }
  if ! systemctl enable --quiet fail2ban || ! systemctl restart fail2ban; then
    sk_host_die "fail2ban did not start"
    return 1
  fi
  sk_host_say "fail2ban: SSH jail added (port $list)"
}

# What SSH allows, for the owner to decide: nothing here changes it.
sk_host_report_ssh() {
  local config root password
  config=$(sk_host_sshd) || return 0
  root=$(sed -n 's/^permitrootlogin //p' <<<"$config")
  password=$(sed -n 's/^passwordauthentication //p' <<<"$config")
  sk_host_say "SSH, as configured (not changed): root login ${root:-unknown}, password login ${password:-unknown}"
  [[ $root != yes ]] || sk_host_say "SSH advice: forbid root login with a password (PermitRootLogin prohibit-password)"
  [[ $password != yes ]] || sk_host_say "SSH advice: once your key works, turn password login off (PasswordAuthentication no)"
}

sk_host_baseline() {
  local ports
  case ${1:-} in
    website)
      sk_host_say "website mode: the website's installer owns this server's security; nothing changed"
      return 0
      ;;
    standalone) ;;
    *) sk_host_die "say standalone or website"; return 1 ;;
  esac
  [[ $EUID -eq 0 ]] || { sk_host_die "run as root"; return 1; }
  ports=$(sk_host_ssh_ports) || ports=''
  [[ -n $ports ]] ||
    { sk_host_die "cannot read the SSH port from 'sshd -T': nothing changed"; return 1; }
  sk_host_firewall "$ports" || return 1
  sk_host_updates || return 1
  sk_host_jail "$ports" || return 1
  sk_host_report_ssh
}
