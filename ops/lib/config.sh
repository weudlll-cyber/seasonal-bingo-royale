#!/usr/bin/env bash
# @file   ops/lib/config.sh
# @brief  The install's files: env file with secrets, install record, stack files, the app image.
#
# Responsibility: write /etc/sbr/<env>.env (0600) — secrets made once with openssl rand
#                 and kept on every later run, the public URL, base path and trusted proxy
#                 for the install type, admin e-mail, optional SMTP, the operator's age key;
#                 write the install record /etc/sbr/install.conf; copy the compose files,
#                 Caddyfile, the sbr CLI and its library to /opt/sbr; build the app image on
#                 the server from a git ref (until a signed release image exists), skipping
#                 the build when the image of that commit is already there.
# Used by:        ops/install.sh, ops/sbr (update)
# Spec:           docs/spec/09-deployment-architecture.md §2, §3

# The value of a key in an existing env file, or nothing (also when there is no file yet).
env_value() {
  [[ -f $1 ]] || return 0
  sed -n "s/^$2=//p" "$1" | head -1
}

# secret <bytes>: hex from openssl rand (a dry run, which installs nothing, may lack it).
secret() {
  if command -v openssl >/dev/null; then
    openssl rand -hex "$1"
  else
    od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'
  fi
}

# write_env <env>: from the answers in SBR_* variables; secrets survive a re-run.
write_env() {
  local env=$1 file="$SBR_ETC/$1.env" pg seed public base site tls
  pg=$(env_value "$file" POSTGRES_PASSWORD)
  seed=$(env_value "$file" SBR_SEED_KEY)
  [[ -n $pg ]] || pg=$(secret 24)
  [[ -n $seed ]] || seed=$(secret 32)
  if [[ $SBR_TYPE == website ]]; then
    public="https://$SBR_WEBSITE_DOMAIN/games/bingo/" base=/games/bingo/ site='' tls=''
  else
    public="https://$SBR_ADDRESS/" base=/ site=$SBR_ADDRESS tls=''
    # An IP address gets Caddy's internal CA (browsers warn until a domain is set).
    [[ $SBR_ADDRESS =~ ^[0-9.]+$|: ]] && tls='tls internal'
    SBR_TRUSTED_PROXIES=uniquelocal
  fi
  put_file "$file" 0600 <<EOF
# Seasonal Bingo Royale, environment $env (written by ops/install.sh; secrets are kept on re-runs).
SBR_INSTALL_TYPE=$SBR_TYPE
SBR_ENV=$env
SBR_ENV_FILE=$file
SBR_IMAGE=$SBR_IMAGE
POSTGRES_PASSWORD=$pg
DATABASE_URL=postgres://sbr:$pg@postgres:5432/sbr
SBR_SEED_KEY=$seed
SBR_PUBLIC_URL=$public
SBR_BASE_PATH=$base
SBR_TRUSTED_PROXIES=$SBR_TRUSTED_PROXIES
SBR_SITE_ADDRESS=$site
SBR_TLS=$tls
SBR_WEBSITE_NETWORK=${SBR_WEBSITE_NETWORK:-}
SBR_ADMIN_EMAIL=$SBR_ADMIN_EMAIL
SBR_SMTP_HOST=${SBR_SMTP_HOST:-}
SBR_SMTP_PORT=${SBR_SMTP_PORT:-}
SBR_SMTP_USER=${SBR_SMTP_USER:-}
SBR_SMTP_PASSWORD=${SBR_SMTP_PASSWORD:-}
SBR_SMTP_FROM=${SBR_SMTP_FROM:-}
SBR_AGE_RECIPIENT=$SBR_AGE_RECIPIENT
SBR_LOG_LEVEL=info
EOF
}

write_record() {
  put_file "$SBR_ETC/install.conf" 0600 <<EOF
# What ops/install.sh installed last; re-runs and sbr read it.
SBR_TYPE=$SBR_TYPE
SBR_ENV=$SBR_ENV
SBR_ADDRESS=${SBR_ADDRESS:-}
SBR_WEBSITE_DOMAIN=${SBR_WEBSITE_DOMAIN:-}
SBR_REPO=$SBR_REPO
SBR_REF=$SBR_REF
EOF
}

# install_files <source dir of ops/>: the stack files and the CLI into /opt/sbr.
install_files() {
  local from=$1 name
  for name in compose.yml compose.website.yml Caddyfile; do
    put_file "$SBR_ROOT/$name" 0644 <"$from/$name"
  done
  for name in common.sh host.sh website.sh config.sh backup.sh; do
    put_file "$SBR_ROOT/lib/$name" 0644 <"$from/lib/$name"
  done
  put_file "$SBR_ROOT/sbr" 0755 <"$from/sbr"
  [[ -L /usr/local/bin/sbr ]] || run ln -sf "$SBR_ROOT/sbr" /usr/local/bin/sbr
}

# build_image <repo> <ref>: sets SBR_IMAGE=sbr-app:<commit> and builds it when missing.
build_image() {
  local repo=$1 ref=$2 src="$SBR_ROOT/src" commit
  if [[ ! -d $src/.git ]]; then
    run git clone --quiet "$repo" "$src"
  fi
  if [[ $SBR_DRY_RUN == 1 && ! -d $src/.git ]]; then
    SBR_IMAGE="sbr-app:<commit of $ref>"
    return 0
  fi
  git -C "$src" fetch --quiet --tags origin
  commit=$(git -C "$src" rev-parse --verify --quiet "origin/$ref^{commit}" || git -C "$src" rev-parse --verify "$ref^{commit}")
  SBR_IMAGE="sbr-app:${commit:0:12}"
  if docker image inspect "$SBR_IMAGE" >/dev/null 2>&1; then
    info "  image $SBR_IMAGE is there already ($ref)"
    return 0
  fi
  info "  building $SBR_IMAGE from $ref on this server (a few minutes)"
  run git -C "$src" -c advice.detachedHead=false checkout --quiet --force "$commit"
  run docker build --quiet -t "$SBR_IMAGE" "$src"
  SBR_CHANGES=$((SBR_CHANGES + 1))
}
