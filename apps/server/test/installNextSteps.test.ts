/**
 * @file   apps/server/test/installNextSteps.test.ts
 * @module server/test
 * @brief  The installer's closing "Next steps" fit the install type.
 *
 * Responsibility: ops/install.sh next_steps, taken out of the installer as it is and run with
 *                 the libraries it uses (dry run: no checks through a proxy). A standalone
 *                 install is told to create its first admin; a website install is not, as
 *                 `sbr admin create-super` refuses there (website admins are game admins, D41),
 *                 and is told where its admins and hosts come from instead.
 * Depends on:     vitest, node:child_process, ops/install.sh, ops/lib/*.sh
 * Spec:           docs/spec/09-deployment-architecture.md §3; docs/operator-guide.md §3
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

function nextSteps(type: 'standalone' | 'website'): string {
  const script = [
    'set -euo pipefail',
    'for lib in common website websiteApply; do source "ops/lib/$lib.sh"; done',
    `eval "$(sed -n '/^next_steps() {/,/^}/p' ops/install.sh)"`,
    `SBR_TYPE=${type} SBR_DRY_RUN=1 SBR_CHANGES=3 SBR_ENV=prod SBR_ADDRESS=bingo.example.org`,
    'SBR_WEBSITE_DOMAIN=example.org SBR_WEBSITE_MODE=nginx SBR_WEBSITE_ROUTES_DIR=/etc/seasonal/routes',
    'next_steps',
  ].join('\n');
  const r = spawnSync('bash', ['-c', script], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`next_steps: ${r.stderr}`);
  return r.stdout + r.stderr;
}

// Each case starts Git Bash and sources four libraries: 0.3 s on an idle Windows machine, past
// the 5 s default when the full verify runs its containers beside it.
describe("the installer's next steps", { timeout: 30_000 }, () => {
  it('tells a standalone install to create its first admin', () => {
    expect(nextSteps('standalone')).toContain('sudo sbr admin create-super');
  });

  it('never tells a website install to run create-super, which refuses there (D41)', () => {
    const said = nextSteps('website');
    expect(said).not.toContain('create-super');
    expect(said).toContain("The website's admins are the game's admins");
    expect(said).toContain('https://example.org/games/bingo/');
  });
});
