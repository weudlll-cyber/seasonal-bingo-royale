#!/usr/bin/env bash
# @file   ops/lib/config.sh
# @module ops
# @brief  The install's files: env file with secrets, install record, stack files, the app image.
#
# Responsibility: read an earlier run's answers back from /etc/sbr/<env>.env so a re-run (also
#                 --yes) keeps them; write that file (0600, single-quoted, atomic): secrets made
#                 once (openssl rand), public URL (IPv6 in brackets), base path, trusted proxies
#                 (install type plus --trusted-proxies), admin e-mail, optional SMTP, age key,
#                 the sign-in mode (website installs: website, D37) with the website's mode,
#                 route settings and the proxy secret (made once), the database roles' passwords
#                 and URLs (owner for the migrations, app for the app; audit-3 S1), other
#                 operator keys kept; set up those roles (apply_db_roles, ./db-roles.sql) and
#                 convert an install made before them once (convert_db_roles); write
#                 /etc/sbr/install.conf; copy compose files,
#                 Caddyfile and the sbr CLI with its library to /opt/sbr (an update keeps the
#                 previous ones for a rollback: save_stack, restore_stack); build the app image from
#                 a git ref on the server (until a signed release image exists; fetch prunes)
#                 unless that commit's image exists; drop app images older than the previous one.
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
    SBR_SMTP_PASSWORD SBR_SMTP_FROM SBR_WEBSITE_NETWORK SBR_EXTRA_PROXIES SBR_WEBSITE_UPSTREAM     SBR_WEBSITE_AUTHORIZE_PATH SBR_WEBSITE_LOGIN_PATH SBR_WEBSITE_ROUTES_DIR SBR_APP_PORT     SBR_EDGE_SUBNET; do
    [[ -n ${!key:-} ]] || printf -v "$key" '%s' "$(env_value "$file" "$key")"
  done
}

# The keys write_env writes. Any other KEY= line of an existing env file (the operator's
# own, e.g. SBR_ALLOWED_ORIGINS) is kept as it is on a re-run.
ENV_KEYS=(SBR_INSTALL_TYPE SBR_ENV SBR_ENV_FILE SBR_IMAGE POSTGRES_PASSWORD DATABASE_URL
  SBR_DB_OWNER_PASSWORD SBR_DB_APP_PASSWORD SBR_MIGRATION_DATABASE_URL
  SBR_SEED_KEY SBR_PUBLIC_URL SBR_BASE_PATH SBR_TRUSTED_PROXIES SBR_EXTRA_PROXIES
  SBR_SITE_ADDRESS SBR_TLS SBR_WEBSITE_NETWORK SBR_ADMIN_EMAIL SBR_SMTP_HOST SBR_SMTP_PORT
  SBR_SMTP_USER SBR_SMTP_PASSWORD SBR_SMTP_FROM SBR_AGE_RECIPIENT SBR_LOG_LEVEL SBR_AUTH_MODE
  SBR_WEBSITE_MODE SBR_WEBSITE_UPSTREAM SBR_WEBSITE_AUTHORIZE_PATH SBR_WEBSITE_LOGIN_PATH
  SBR_WEBSITE_ROUTES_DIR SBR_APP_PORT SBR_EDGE_SUBNET SBR_WEBSITE_PROXY_SECRET
  SBR_WEBSITE_SYNC_TOKEN SBR_SITE_DIR)

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
  local env=$1 file="$SBR_ETC/$1.env" pg seed proxy public base site tls key extra owner app
  pg=$(env_value "$file" POSTGRES_PASSWORD)
  owner=$(env_value "$file" SBR_DB_OWNER_PASSWORD)
  app=$(env_value "$file" SBR_DB_APP_PASSWORD)
  seed=$(env_value "$file" SBR_SEED_KEY)
  proxy=$(env_value "$file" SBR_WEBSITE_PROXY_SECRET)
  [[ -n $pg ]] || pg=$(secret 24)
  [[ -n $owner ]] || owner=$(secret 24)
  [[ -n $app ]] || app=$(secret 24)
  [[ -n $seed ]] || seed=$(secret 32)
  # The secret the game's route file sends with the identity headers (07 §2.3).
  [[ -n $proxy || $SBR_TYPE != website ]] || proxy=$(secret 32)
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
    # The app connects as the app role; the migrate service as the owner (audit-3 S1).
    quoted SBR_DB_OWNER_PASSWORD "$owner"
    quoted SBR_DB_APP_PASSWORD "$app"
    quoted DATABASE_URL "$(db_url sbr_app "$app")"
    quoted SBR_MIGRATION_DATABASE_URL "$(db_url sbr_owner "$owner")"
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
    # D37: a website install signs players in only through the website's proxy.
    quoted SBR_AUTH_MODE "$([[ $SBR_TYPE == website ]] && echo website || echo local)"
    for key in SBR_WEBSITE_MODE SBR_WEBSITE_UPSTREAM SBR_WEBSITE_AUTHORIZE_PATH       SBR_WEBSITE_LOGIN_PATH SBR_WEBSITE_ROUTES_DIR SBR_APP_PORT SBR_EDGE_SUBNET; do
      quoted "$key" "$([[ $SBR_TYPE == website ]] && printf '%s' "${!key:-}")"
    done
    quoted SBR_WEBSITE_PROXY_SECRET "$([[ $SBR_TYPE == website ]] && printf '%s' "$proxy")"
    # Own-Caddy mode: the website's checkout, where the route file lives (its install.conf).
    quoted SBR_SITE_DIR "$([[ $SBR_TYPE == website ]] && printf '%s' "${SBR_SITE_DIR:-}")"
    # The website's account-changes token (07 §2.4), read from its file at every run.
    quoted SBR_WEBSITE_SYNC_TOKEN "$([[ $SBR_TYPE == website ]] && sync_token)"
    operator_lines "$file"
  } | put_file "$file" 0600
}

# db_url <role> <password>: the URL of a role on the stack's database.
db_url() { printf 'postgres://%s:%s@postgres:5432/sbr' "$1" "$2"; }

# convert_db_roles <env>: an install made before the database roles gets their passwords and
# URLs once (sbr update); the superuser's password stays for the database container.
convert_db_roles() {
  local file="$SBR_ETC/$1.env" owner app
  owner=$(secret 24)
  app=$(secret 24)
  set_env_value "$file" SBR_DB_OWNER_PASSWORD "$owner"
  set_env_value "$file" SBR_DB_APP_PASSWORD "$app"
  set_env_value "$file" DATABASE_URL "$(db_url sbr_app "$app")"
  set_env_value "$file" SBR_MIGRATION_DATABASE_URL "$(db_url sbr_owner "$owner")"
}

# apply_db_roles <env>: the owner and app roles with the env file's passwords and the schema
# owned by the owner (./db-roles.sql), as the superuser over the database container's local
# socket. The passwords go into the script with bash's own substitution and reach psql on
# standard input: never on a command line, never printed.
apply_db_roles() {
  local file="$SBR_ETC/$1.env" owner app sql
  if [[ $SBR_DRY_RUN == 1 ]]; then
    info "  would set up the database roles sbr_owner and sbr_app"
    return 0
  fi
  owner=$(env_value "$file" SBR_DB_OWNER_PASSWORD)
  app=$(env_value "$file" SBR_DB_APP_PASSWORD)
  [[ -n $owner && -n $app ]] || die "the env file has no database role passwords"
  compose "$1" up -d --wait postgres
  sql=$(<"$SBR_ROOT/lib/db-roles.sql")
  sql=${sql//__OWNER_PASSWORD__/$owner}
  sql=${sql//__APP_PASSWORD__/$app}
  printf '%s\n' "$sql" |
    compose "$1" exec -T postgres psql -X -q -o /dev/null -v ON_ERROR_STOP=1 -U sbr -d sbr
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
  local from=$1 name path
  for name in compose.yml compose.website.yml compose.website-nginx.yml; do
    put_file "$SBR_ROOT/$name" 0644 <"$from/$name"
  done
  put_file "$SBR_ROOT/caddy/Caddyfile" 0644 <"$from/Caddyfile"
  # Every file of the library, so a version that adds one brings it along (an update
  # installs the new version's files with the CLI it replaces); none is ever removed here.
  for path in "$from"/lib/*.sh "$from"/lib/*.sql; do
    [[ -f $path ]] || continue
    put_file "$SBR_ROOT/lib/${path##*/}" 0644 <"$path"
  done
  put_file "$SBR_ROOT/sbr" 0755 <"$from/sbr"
  [[ -L /usr/local/bin/sbr ]] || run ln -sf "$SBR_ROOT/sbr" /usr/local/bin/sbr
}

# The stack files an update replaces (install_files): kept for a rollback (audit O1).
STACK_FILES=(compose.yml compose.website.yml compose.website-nginx.yml caddy lib sbr)

# save_stack <dir>: copies the installed stack files to <dir>/stack.
save_stack() {
  rm -rf "$1/stack"
  install -d -m 0700 "$1/stack"
  (cd "$SBR_ROOT" && cp -a "${STACK_FILES[@]}" "$1/stack/")
}

# restore_stack <dir>: puts the stack files saved by save_stack back.
restore_stack() {
  [[ -d $1/stack ]] || return 0
  (cd "$1/stack" && cp -a "${STACK_FILES[@]}" "$SBR_ROOT/")
  rm -rf "$1/stack"
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
