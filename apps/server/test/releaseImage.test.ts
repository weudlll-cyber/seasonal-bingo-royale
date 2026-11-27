/**
 * @file   apps/server/test/releaseImage.test.ts
 * @module server/test
 * @brief  The installer's image: a version tag takes the signed release, anything else is built.
 *
 * Responsibility: ops/lib/release.sh with the kit's `sk_image_verify`, docker, cosign and the
 *                 kit's cosign install stood in by shell functions: which ref takes which source
 *                 (the setting SBR_IMAGE_SOURCE wins); a release installs cosign, is verified
 *                 for the ref's commit, pulled by its digest and named sbr-app:<commit>; a
 *                 refused signature or another source commit stops with nothing pulled or named.
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

// The libraries with stand-ins: cosign says yes or no (for the signature, and apart from that
// for the source commit it is asked about) and writes down its questions; docker answers the
// digest and writes down what it was asked to pull and name.
function run(lines: readonly string[], stand: { signed?: boolean; commit?: string } = {}) {
  const asked = `*"--certificate-github-workflow-sha ${stand.commit ?? COMMIT} "*`;
  const script = [
    'set -euo pipefail',
    'shopt -s inherit_errexit',
    'source ops/lib/common.sh',
    'source ops/kit/lib/image.sh',
    'source ops/lib/release.sh',
    'SBR_ETC=/nonexistent SBR_CHANGES=0 SBR_IMAGE=sbr-app:aaaaaaaaaaaa',
    'sk_cosign_install() { echo "cosign installed" >&2; }',
    // cosign's own output is dropped by the kit, so the stand-in only answers.
    `cosign() { ${(stand.signed ?? true) ? ':' : 'return 1'}; case "$* " in ${asked}) return 0 ;; *--certificate-github-workflow-sha*) return 1 ;; esac; }`,
    `docker() { case "$1 $2" in "buildx imagetools") echo ${DIGEST} ;; *) echo "docker $*" >&2 ;; esac; }`,
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

  it('installs cosign, then pulls a verified release by digest and names it', () => {
    const r = run([`release_image v1.2.3 ${COMMIT}`]);
    expect(r.status, r.err).toBe(0);
    const name = `ghcr.io/weudlll-cyber/seasonal-bingo-royale@${DIGEST}`;
    expect(r.err).toContain('cosign installed');
    expect(r.err).toContain(`docker pull --quiet ${name}`);
    expect(r.err).toContain(`docker tag ${name} sbr-app:aaaaaaaaaaaa`);
  });

  it('pulls nothing without the signature', () => {
    const r = run([`release_image v1.2.3 ${COMMIT}`], { signed: false });
    expect(r.status).not.toBe(0);
    expect(r.err).toContain('carries no signature');
    expect(r.err).not.toContain('docker pull');
  });

  it('refuses a release signed for another commit, pulling nothing', () => {
    const r = run([`release_image v1.2.3 ${COMMIT}`], { commit: 'c'.repeat(40) });
    expect(r.status).not.toBe(0);
    expect(r.err).toContain('was not built from commit');
    expect(r.err).not.toContain('docker pull');
  });
});
