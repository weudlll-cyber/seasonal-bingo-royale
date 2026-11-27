#!/usr/bin/env bash
# @file   ops/lib/image.sh
# @module ops
# @brief  An installer takes a release image only if the project's release workflow signed it
#         (K109).
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
#                 version tag or a full commit. No key, no token: the registry's own login applies.
# Depends on:     bash 4, cosign 3 or later, docker (to look up a tag's digest)
# Source:         new in the kit; the signing it checks is seasonal-bingo-royale
#                 .github/workflows/release.yml's prepared cosign step at d7d841e.
# Spec:           kit DECISIONS K109; docs/OPERATIONS.md "Signed release images"

SK_IMAGE_ISSUER=https://token.actions.githubusercontent.com
SK_IMAGE_KIT_SIGNER='^https://github\.com/weudlll-cyber/seasonal-kit/\.github/workflows/release-image\.yml@(refs/tags/v[0-9]+\.[0-9]+\.[0-9]+|[0-9a-f]{40})$'

sk_image_die() {
  printf 'image: %s\n' "$*" >&2
  return 1
}

# sk_image_digest <reference>: the digest it names, or the registry's for its tag; empty if none.
sk_image_digest() {
  if [[ $1 == *@* ]]; then
    printf '%s' "${1##*@}"
  else
    docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null || true
  fi
}

sk_image_verify() {
  local ref=${1:-} repo=${SK_IMAGE_REPOSITORY:-} name digest
  [[ $ref =~ ^[a-z0-9.-]+(:[0-9]+)?(/[a-z0-9._-]+)+(:[A-Za-z0-9_.-]+)?(@sha256:[0-9a-f]{64})?$ ]] ||
    { sk_image_die 'pass an image with its registry, like ghcr.io/owner/game:1.2.0.'; return 1; }
  [[ $repo =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] ||
    { sk_image_die "SK_IMAGE_REPOSITORY is the project's repository, as owner/name."; return 1; }
  command -v cosign >/dev/null ||
    { sk_image_die 'cosign is not installed, so no image can be checked.'; return 1; }
  digest=$(sk_image_digest "$ref")
  [[ $digest =~ ^sha256:[0-9a-f]{64}$ ]] ||
    { sk_image_die "$ref cannot be found in its registry, so it is not used."; return 1; }
  # The name without its digest and tag (a ":" in the last part only; a registry's port stays).
  name=${ref%@*}
  [[ ${name##*/} != *:* ]] || name=${name%:*}
  # cosign's own words are dropped: the one sentence below says what matters.
  cosign verify --certificate-oidc-issuer "$SK_IMAGE_ISSUER" \
    --certificate-identity-regexp "${SK_IMAGE_SIGNER:-$SK_IMAGE_KIT_SIGNER}" \
    --certificate-github-workflow-repository "$repo" "$name@$digest" >/dev/null 2>&1 ||
    { sk_image_die "$ref carries no signature of $repo's release workflow, so it is not used."; return 1; }
  printf '%s@%s\n' "$name" "$digest"
}
