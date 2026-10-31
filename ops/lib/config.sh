#!/usr/bin/env bash
# @file   ops/lib/config.sh
# @module ops
# @brief  The install's files: env file with secrets, install record, stack files, the app image.
#
# Responsibility: read the answers of an earlier run back from /etc/sbr/<env>.env, so a
#                 re-run (also with --yes) keeps them; write that file (0600, values
#                 single-quoted for Compose, written atomically) — secrets made once with
#                 openssl rand and kept on every later run, the public URL (an IPv6 address
#                 in brackets), base path and trusted proxies for the install type plus the
#                 operator's extra ones (--trusted-proxies), admin e-mail, optional SMTP,
#                 the operator's age key, and every other key the operator added kept as it
#                 is; write the install record /etc/sbr/install.conf; copy the compose
#                 files, Caddyfile, the sbr CLI and its library to /opt/sbr; build the app
#                 image on the server from a git ref (until a signed release image exists;
#                 the fetch prunes deleted branches), skipping it when the image of that
#                 commit is there, and drop app images older than the current and the
#                 previous one.
# Depends on:     ./common.sh (put_file, run, env_value, url_host), git, docker, openssl
# Used by:        ops/install.sh, ops/sbr (update)
# Spec:           docs/spec/09-deployment-architecture.md §2, §3

# secret <bytes>: hex from openssl rand (a dry run, which installs nothing, may lack it).
secret() {
  if command -v openssl >/dev/null; then
    openssl rand -hex "$1"
  else
    od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'
  fi
}

# Answers of an earlier run, unless a flag gave a new one (audit O4).
read_saved_answers() {
  local file="$SBR_ETC/$1.env" key
  for key in SBR_ADMIN_EMAIL SBR_AGE_RECIPIENT SBR_SMTP_HOST SBR_SMTP_PORT SBR_SMTP_USER \
    SBR_SMTP_PASSWORD SBR_SMTP_FROM SBR_WEBSITE_NETWORK SBR_EXTRA_PROXIES; do
    [[ -n ${!key:-} ]] || printf -v "$key" '%s' "$(env_value "$file" "$key")"
  done
}

# The keys write_env writes. Any other KEY= line of an existing env file (the operator's
# own, e.g. SBR_ALLOWED_ORIGINS) is kept as it is on a re-run.
ENV_KEYS=(SBR_INSTALL_TYPE SBR_ENV SBR_ENV_FILE SBR_IMAGE POSTGRES_PASSWORD DATABASE_URL
  SBR_SEED_KEY SBR_PUBLIC_URL SBR_BASE_PATH SBR_TRUSTED_PROXIES SBR_EXTRA_PROXIES
  SBR_SITE_ADDRESS SBR_TLS SBR_WEBSITE_NETWORK SBR_ADMIN_EMAIL SBR_SMTP_HOST SBR_SMTP_PORT
  SBR_SMTP_USER SBR_SMTP_PASSWORD SBR_SMTP_FROM SBR_AGE_RECIPIENT SBR_LOG_LEVEL)

# operator_lines <env file>: its KEY= lines whose key write_env does not write.
operator_lines() {
  local known
  [[ -f $1 ]] || return 0
  known=$(IFS='|' && printf '%s' "${ENV_KEYS[*]}")
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" | grep -vE "^($known)=" || true
}

# KEY='value' — Compose then takes the value literally; a single quote cannot be written so.
quoted() {
  [[ $2 != *"'"* ]] || die "$1 must not contain a single quote (')"
  printf "%s='%s'\n" "$1" "$2"
}

# write_env <env>: from the answers in SBR_* variables; secrets survive a re-run.
write_env() {
  local env=$1 file="$SBR_ETC/$1.env" pg seed public base site tls key extra
  pg=$(env_value "$file" POSTGRES_PASSWORD)
  seed=$(env_value "$file" SBR_SEED_KEY)
  [[ -n $pg ]] || pg=$(secret 24)
  [[ -n $seed ]] || seed=$(secret 32)
  if [[ $SBR_TYPE == website ]]; then
    public="https://$(url_host "$SBR_WEBSITE_DOMAIN")/games/bingo/" base=/games/bingo/ site='' tls=''
  else
    public="https://$(url_host "$SBR_ADDRESS")/" base=/ site=$SBR_ADDRESS tls=''
    # An IP address gets Caddy's internal CA (browsers warn until a domain is set).
    [[ $SBR_ADDRESS =~ ^[0-9.]+$|: ]] && tls='tls internal'
    SBR_TRUSTED_PROXIES=uniquelocal
  fi
  # --trusted-proxies: proxies in front of this server (e.g. Cloudflare), added to the one the
  # install type needs; "none" removes the saved ones.
  extra=${SBR_EXTRA_PROXIES:-}
  [[ $extra != none ]] || extra=''
  {
    echo "# Seasonal Bingo Royale, environment $env (written by ops/install.sh; secrets are kept on re-runs)."
    quoted SBR_INSTALL_TYPE "$SBR_TYPE"
    quoted SBR_ENV "$env"
    quoted SBR_ENV_FILE "$file"
    quoted SBR_IMAGE "$SBR_IMAGE"
    quoted POSTGRES_PASSWORD "$pg"
    quoted DATABASE_URL "postgres://sbr:$pg@postgres:5432/sbr"
    quoted SBR_SEED_KEY "$seed"
    quoted SBR_PUBLIC_URL "$public"
    quoted SBR_BASE_PATH "$base"
    quoted SBR_TRUSTED_PROXIES "$SBR_TRUSTED_PROXIES${extra:+,$extra}"
    quoted SBR_EXTRA_PROXIES "$extra"
    quoted SBR_SITE_ADDRESS "$site"
    quoted SBR_TLS "$tls"
    for key in SBR_WEBSITE_NETWORK SBR_ADMIN_EMAIL SBR_SMTP_HOST SBR_SMTP_PORT SBR_SMTP_USER \
      SBR_SMTP_PASSWORD SBR_SMTP_FROM SBR_AGE_RECIPIENT; do
      quoted "$key" "${!key:-}"
    done
    quoted SBR_LOG_LEVEL info
    operator_lines "$file"
  } | put_file "$file" 0600
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
  for name in compose.yml compose.website.yml; do
    put_file "$SBR_ROOT/$name" 0644 <"$from/$name"
  done
  put_file "$SBR_ROOT/caddy/Caddyfile" 0644 <"$from/Caddyfile"
  for name in common.sh host.sh website.sh config.sh backup.sh; do
    put_file "$SBR_ROOT/lib/$name" 0644 <"$from/lib/$name"
  done
  put_file "$SBR_ROOT/sbr" 0755 <"$from/sbr"
  [[ -L /usr/local/bin/sbr ]] || run ln -sf "$SBR_ROOT/sbr" /usr/local/bin/sbr
}

# build_image <repo> <ref>: sets SBR_IMAGE=sbr-app:<commit> and builds it when missing.
build_image() {
  local repo=$1 ref=$2 src="$SBR_ROOT/src" commit
  if [[ $SBR_DRY_RUN == 1 ]]; then
    # A dry run touches nothing, not even the checkout (audit O11).
    info "  would fetch $ref from $repo into $src and build sbr-app:<commit>"
    SBR_IMAGE="sbr-app:<commit of $ref>"
    return 0
  fi
  if [[ ! -d $src/.git ]]; then
    git clone --quiet "$repo" "$src"
  elif [[ $(git -C "$src" remote get-url origin) != "$repo" ]]; then
    git -C "$src" remote set-url origin "$repo"
  fi
  # --prune: a branch deleted upstream no longer resolves as origin/<ref> (audit, low).
  git -C "$src" fetch --quiet --prune --tags origin
  commit=$(git -C "$src" rev-parse --verify --quiet "origin/$ref^{commit}" || git -C "$src" rev-parse --verify "$ref^{commit}")
  SBR_IMAGE="sbr-app:${commit:0:12}"
  if docker image inspect "$SBR_IMAGE" >/dev/null 2>&1; then
    info "  image $SBR_IMAGE is there already ($ref)"
    return 0
  fi
  info "  building $SBR_IMAGE from $ref on this server (a few minutes)"
  git -C "$src" -c advice.detachedHead=false checkout --quiet --force "$commit"
  docker build --quiet -t "$SBR_IMAGE" "$src"
  SBR_CHANGES=$((SBR_CHANGES + 1))
}

# prune_images <keep…>: removes sbr-app images other than the ones named (current, previous).
prune_images() {
  local image
  for image in $(docker image ls sbr-app --format '{{.Repository}}:{{.Tag}}'); do
    [[ " $* " == *" $image "* ]] || docker image rm "$image" >/dev/null 2>&1 || true
  done
}
