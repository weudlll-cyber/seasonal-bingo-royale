/**
 * @file   apps/server/test/releaseImage.test.ts
 * @module server/test
 * @brief  The installer's image: a version tag takes the signed release, anything else is built.
 *
 * Responsibility: ops/lib/release.sh with the kit's `sk_image_verify`, docker and cosign stood
 *                 in by shell functions: which ref takes which source (the setting
 *                 SBR_IMAGE_SOURCE wins), a verified release is pulled by its digest, checked to
 *                 be built from the ref's commit and named sbr-app:<commit>; a refused signature
 *                 or another commit stops with nothing named.
 * Depends on:     vitest, node:child_process, ops/lib/common.sh, ops/lib/release.sh,
 *                 ops/kit/lib/image.sh
 * Spec:           docs/spec/09-deployment-architecture.md §4; kit docs/OPERATIONS.md
 *                 "Signed release images"
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const COMMIT = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;

// The libraries with stand-ins: cosign says yes or no, docker answers the digest and the
// image's revision label and writes down what it was asked to pull and name.
function run(lines: readonly string[], stand: { signed?: boolean; revision?: string } = {}) {
  const script = [
    'set -euo pipefail',
    'shopt -s inherit_errexit',
    'source ops/lib/common.sh',
    'source ops/kit/lib/image.sh',
    'source ops/lib/release.sh',
    'SBR_ETC=/nonexistent SBR_CHANGES=0 SBR_IMAGE=sbr-app:aaaaaaaaaaaa',
    `cosign() { return ${(stand.signed ?? true) ? '0' : '1'}; }`,
    `docker() { case "$1 $2" in "buildx imagetools") echo ${DIGEST} ;; "image inspect") echo ${stand.revision ?? COMMIT} ;; *) echo "docker $*" >&2 ;; esac; }`,
    ...lines,
  ].join('\n');
  const r = spawnSync('bash', ['-c', script], { cwd: REPO, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

describe("the installer's image", { timeout: 30_000 }, () => {
  it('takes the release for a version tag and builds anything else', () => {
    const r = run(['image_source v1.2.3', 'image_source master', 'image_source 5fdd03f']);
    expect(r.out.trim().split('\n')).toEqual(['release', 'build', 'build']);
  });

  it('does as the setting says, and takes a release only for a version tag', () => {
    expect(run(['SBR_IMAGE_SOURCE=build', 'image_source v1.2.3']).out.trim()).toBe('build');
    const refused = run(['SBR_IMAGE_SOURCE=release', 'x=$(image_source master)', 'echo went-on']);
    expect(refused.status).not.toBe(0);
    expect(refused.out).not.toContain('went-on');
    expect(refused.err).toContain('version tag');
  });

  it('pulls a verified release by digest and names it after the commit', () => {
    const r = run([`release_image v1.2.3 ${COMMIT}`]);
    expect(r.status, r.err).toBe(0);
    const name = `ghcr.io/weudlll-cyber/seasonal-bingo-royale@${DIGEST}`;
    expect(r.err).toContain(`docker pull --quiet ${name}`);
    expect(r.err).toContain(`docker tag ${name} sbr-app:aaaaaaaaaaaa`);
  });

  it('pulls nothing without the signature', () => {
    const r = run([`release_image v1.2.3 ${COMMIT}`], { signed: false });
    expect(r.status).not.toBe(0);
    expect(r.err).toContain('carries no signature');
    expect(r.err).not.toContain('docker pull');
  });

  it('refuses an image built from another commit, naming nothing', () => {
    const r = run([`release_image v1.2.3 ${COMMIT}`], { revision: 'c'.repeat(40) });
    expect(r.status).not.toBe(0);
    expect(r.err).toContain('not from');
    expect(r.err).not.toContain('docker tag');
  });
});
