#!/usr/bin/env bash
# @file   ops/lib/host.sh
# @module ops
# @brief  The server itself: OS, CPU/RAM/disk, free ports, Docker Engine with Compose.
#
# Responsibility: refuse anything but Ubuntu 24.04 (unless --any-os), warn below the
#                 reference size (09 §1: 4 vCPU, 8 GB, 100 GB; minimum 2 vCPU, 4 GB, 20 GB
#                 free), check that 80/443 are free for a standalone install (our own Caddy
#                 holding them on a re-run is fine), and install Docker Engine and the
#                 Compose plugin from Docker's own apt repository when they are missing.
# Used by:        ops/install.sh
# Spec:           docs/spec/09-deployment-architecture.md §1, §3

check_os() {
  local id version
  id=$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')
  version=$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '"')
  if [[ $id != ubuntu || $version != 24.04 ]]; then
    [[ ${SBR_ANY_OS:-0} == 1 ]] || die "this installer is made for Ubuntu 24.04 (found $id $version); --any-os tries anyway"
    warn "not Ubuntu 24.04 ($id $version); going on because of --any-os"
  fi
  info "  system: $id $version"
}

check_resources() {
  local cpus mem_mb disk_gb
  cpus=$(nproc)
  mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
  disk_gb=$(df -Pk /var | awk 'NR == 2 { print int($4 / 1048576) }')
  info "  resources: $cpus CPU, $mem_mb MB RAM, $disk_gb GB free on /var"
  if ((cpus < 2 || mem_mb < 3500 || disk_gb < 20)); then
    warn "below the minimum of 2 CPU, 4 GB RAM and 20 GB free disk"
  elif ((cpus < 4 || mem_mb < 7500)); then
    info "  (the reference size is 4 CPU and 8 GB RAM; this works for smaller matches)"
  fi
}

# check_ports <env>: 80 and 443 must be free, or held by this install's own Caddy.
check_ports() {
  local env=$1 port holder
  command -v ss >/dev/null || {
    warn "cannot check ports 80/443 (ss is missing; apt-get install iproute2)"
    return 0
  }
  for port in 80 443; do
    if ss -ltnH "sport = :$port" | grep -q .; then
      holder=$(docker ps --filter "publish=$port" --format '{{.Names}}' 2>/dev/null | head -1)
      [[ $holder == "sbr-$env-caddy-1" ]] && continue
      die "port $port is in use (${holder:-another program}); a standalone install needs 80 and 443 free"
    fi
  done
  info "  ports 80 and 443: free for Caddy"
}

# The tools the installer itself uses (present on a standard Ubuntu server).
install_prereqs() {
  local missing=() tool
  for tool in curl git openssl ss; do command -v "$tool" >/dev/null || missing+=("$tool"); done
  ((${#missing[@]})) || return 0
  info "  installing ${missing[*]}"
  run apt-get update -q
  run apt-get install -y -q ca-certificates curl git openssl iproute2
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "  Docker: $(docker --version | cut -d, -f1), Compose $(docker compose version --short)"
    return 0
  fi
  info "  installing Docker Engine and the Compose plugin from Docker's repository"
  run apt-get update -q
  run apt-get install -y -q ca-certificates curl
  run install -m 0755 -d /etc/apt/keyrings
  run curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  run chmod a+r /etc/apt/keyrings/docker.asc
  local codename arch
  codename=$(sed -n 's/^VERSION_CODENAME=//p' /etc/os-release)
  arch=$(dpkg --print-architecture)
  put_file /etc/apt/sources.list.d/docker.list 0644 <<EOF
deb [arch=$arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable
EOF
  run apt-get update -q
  run apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  run systemctl enable --now docker
}
