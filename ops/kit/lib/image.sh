#!/usr/bin/env bash
# @file   ops/lib/image.sh
# @module ops
# @brief  An installer takes a release image only if the project's release workflow signed it
#         (K109), with the cosign it installs itself.
#
# Responsibility: sourced by a game's installer. `sk_image_verify <image>` finds the image's digest
#                 (from the reference, or from its registry), checks with `cosign verify` that this
#                 digest carries a keyless signature made by the kit's release workflow
#                 (.github/workflows/release-image.yml) running in the project's own repository
#                 (SK_IMAGE_REPOSITORY, "owner/name"), and prints "name@sha256:…", the one thing
#                 to pull and run. An unsigned image, another project's, or one signed by another
#                 workflow is refused with one English sentence and nothing on standard output.
#                 SK_IMAGE_SIGNER (a regular expression over the signing identity) is for a
#                 project that signs with another ref; the default takes the kit's workflow at a
#                 version tag or a full commit. With SK_IMAGE_COMMIT (a full commit, since
#                 v0.39.0) the certificate must also name it as the workflow's source commit.
#                 `sk_cosign_install` (v0.39.0) puts the pinned cosign into SK_COSIGN_DIR
#                 (default /usr/local/bin): downloaded over https from its GitHub release and
#                 installed only where it carries the release's published SHA-256, which is
#                 pinned here; a bump changes the version and both checksums by hand. No key,
#                 no token: the registry's own login applies.
# Depends on:     bash 4, cosign 3 or later, docker (to look up a tag's digest); curl and
#                 sha256sum (the install)
# Source:         new in the kit; the signing it checks is seasonal-bingo-royale
#                 .github/workflows/release.yml's prepared cosign step at d7d841e.
# Spec:           kit DECISIONS K109; docs/OPERATIONS.md "Signed release images"

SK_IMAGE_ISSUER=https://token.actions.githubusercontent.com
SK_IMAGE_KIT_SIGNER='^https://github\.com/weudlll-cyber/seasonal-kit/\.github/workflows/release-image\.yml@(refs/tags/v[0-9]+\.[0-9]+\.[0-9]+|[0-9a-f]{40})$'

# The cosign `sk_cosign_install` installs, with the SHA-256 of cosign-linux-<arch> from that
# release's cosign_checksums.txt.
SK_COSIGN_VERSION=3.1.6
SK_COSIGN_SHA256_AMD64=318a99ade4156a0c4113aa983b46c0a0830fa7896a096c63121ee47b610a94c6
SK_COSIGN_SHA256_ARM64=bbb2ebc765f483cf9fac42da8763dddc2b55b350ee12ea0c44a520a6d6d52334

sk_image_die() {
  printf 'image: %s\n' "$*" >&2
  return 1
}

# sk_cosign_has <file> <sha256>: the file carries exactly that checksum.
sk_cosign_has() { printf '%s  %s\n' "$2" "$1" | sha256sum -c --status 2>/dev/null; }

sk_cosign_install() {
  local dir=${SK_COSIGN_DIR:-/usr/local/bin} arch sum temp url
  case $(uname -m) in
    x86_64) arch=amd64 sum=$SK_COSIGN_SHA256_AMD64 ;;
    aarch64 | arm64) arch=arm64 sum=$SK_COSIGN_SHA256_ARM64 ;;
    *) sk_image_die "cosign is not pinned for $(uname -m)."; return 1 ;;
  esac
  # Installed already, byte for byte: nothing is fetched.
  if [[ -x $dir/cosign ]] && sk_cosign_has "$dir/cosign" "$sum"; then return 0; fi
  url="https://github.com/sigstore/cosign/releases/download/v$SK_COSIGN_VERSION/cosign-linux-$arch"
  temp=$(mktemp) || return 1
  if ! curl -fsSL --proto '=https' --tlsv1.2 -o "$temp" "$url" 2>/dev/null; then
    rm -f "$temp"
    sk_image_die 'cosign could not be downloaded.'
    return 1
  fi
  # Checked before it is run or put anywhere.
  if ! sk_cosign_has "$temp" "$sum"; then
    rm -f "$temp"
    sk_image_die 'the downloaded cosign does not carry the pinned checksum, so it is not installed.'
    return 1
  fi
  install -D -m 0755 "$temp" "$dir/cosign" || { rm -f "$temp"; return 1; }
  rm -f "$temp"
}

# sk_image_digest <reference>: the digest it names, or the registry's for its tag; empty if none.
sk_image_digest() {
  if [[ $1 == *@* ]]; then
    printf '%s' "${1##*@}"
  else
    docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null || true
  fi
}

# sk_image_signed <name@digest> <repository> [more of cosign's checks]: cosign's own words are
# dropped; the caller's one sentence says what matters.
sk_image_signed() {
  local image=$1 repo=$2
  shift 2
  cosign verify --certificate-oidc-issuer "$SK_IMAGE_ISSUER" \
    --certificate-identity-regexp "${SK_IMAGE_SIGNER:-$SK_IMAGE_KIT_SIGNER}" \
    --certificate-github-workflow-repository "$repo" "$@" "$image" >/dev/null 2>&1
}

sk_image_verify() {
  local ref=${1:-} repo=${SK_IMAGE_REPOSITORY:-} commit=${SK_IMAGE_COMMIT:-} name digest
  [[ $ref =~ ^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)+(:[A-Za-z0-9_.-]+)?(@sha256:[0-9a-f]{64})?$ ]] ||
    { sk_image_die 'pass an image with its registry, like ghcr.io/owner/game:1.2.0.'; return 1; }
  [[ $repo =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] ||
    { sk_image_die "SK_IMAGE_REPOSITORY is the project's repository, as owner/name."; return 1; }
  [[ -z $commit || $commit =~ ^[0-9a-f]{40}$ ]] ||
    { sk_image_die 'SK_IMAGE_COMMIT is a full commit, 40 hex digits.'; return 1; }
  command -v cosign >/dev/null || {
    sk_image_die 'cosign is not installed, so no image can be checked (sk_cosign_install installs it).'
    return 1
  }
  digest=$(sk_image_digest "$ref")
  [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] ||
    { sk_image_die "$ref cannot be found in its registry, so it is not used."; return 1; }
  # The name without its digest and tag (a ":" in the last part only; a registry's port stays).
  name=${ref%@*}
  [[ ${name##*/} != *:* ]] || name=${name%:*}
  sk_image_signed "$name@$digest" "$repo" ||
    { sk_image_die "$ref carries no signature of $repo's release workflow, so it is not used."; return 1; }
  # Signed: now whether from the expected source commit.
  [[ -z $commit ]] ||
    sk_image_signed "$name@$digest" "$repo" --certificate-github-workflow-sha "$commit" ||
    { sk_image_die "$ref was not built from commit $commit, so it is not used."; return 1; }
  printf '%s@%s\n' "$name" "$digest"
}
