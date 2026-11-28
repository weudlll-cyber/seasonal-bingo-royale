#!/usr/bin/env bash
# @file   ops/lib/release.sh
# @module ops
# @brief  Where an install's image comes from: the signed release, or a build on the server.
#
# Responsibility: a version tag takes the release image its release made
#                 (.github/workflows/release.yml): the kit installs its pinned cosign and
#                 `sk_image_verify` checks the signature and that it was signed for the tag's
#                 commit; the image is pulled by digest and named sbr-app:<commit> like a built
#                 one. Anything else (a branch, a commit) is built. SBR_IMAGE_SOURCE=release|build (the installer's --image-source, kept in
#                 install.conf) decides instead: "build" is the way until a first release exists.
#                 SBR_IMAGE_NAME and SBR_IMAGE_REPOSITORY name another registry and repository.
# Depends on:     ./common.sh (info, die, env_value), ../kit/lib/image.sh (curl), docker
# Used by:        ops/lib/config.sh (build_image)
# Spec:           docs/spec/09-deployment-architecture.md §4; kit docs/OPERATIONS.md "Signed
#                 release images"

# image_source <ref>: prints "release" or "build".
image_source() {
  local ref=$1 setting version='^v[0-9]+\.[0-9]+\.[0-9]+$'
  setting=${SBR_IMAGE_SOURCE:-$(env_value "$SBR_ETC/install.conf" SBR_IMAGE_SOURCE)}
  case $setting in
    build) echo build ;;
    release)
      [[ $ref =~ $version ]] || die "SBR_IMAGE_SOURCE=release takes a version tag (v1.2.3), not $ref"
      echo release
      ;;
    '') if [[ $ref =~ $version ]]; then echo release; else echo build; fi ;;
    *) die "the image source is release or build, not \"$setting\"" ;;
  esac
}

# release_image <tag> <commit>: the tag's verified release image as $SBR_IMAGE.
release_image() {
  local ref=$1 commit=$2 verified
  local name=${SBR_IMAGE_NAME:-ghcr.io/weudlll-cyber/seasonal-bingo-royale}
  info "  taking the release image of $ref (its signature is checked first)"
  # The kit's pinned cosign, fetched once; then the signature, and the commit it was signed for.
  sk_cosign_install || die "cosign could not be installed (above)"
  verified=$(SK_IMAGE_REPOSITORY=${SBR_IMAGE_REPOSITORY:-weudlll-cyber/seasonal-bingo-royale} \
    SK_IMAGE_COMMIT=$commit sk_image_verify "$name:${ref#v}") ||
    die "the release image of $ref was refused (above); --image-source build builds on this server instead"
  docker pull --quiet "$verified" || die "the release image of $ref could not be pulled"
  docker tag "$verified" "$SBR_IMAGE"
  SBR_CHANGES=$((SBR_CHANGES + 1))
}
