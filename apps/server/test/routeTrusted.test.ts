/**
 * @file   apps/server/test/routeTrusted.test.ts
 * @module server/test
 * @brief  The route file says from which addresses the app takes the proxy secret (kit K72).
 *
 * Responsibility: ops/lib/websiteApply.sh `route_settings` gives the kit's route step the
 *                 environment's trusted proxies as SK_ROUTE_TRUSTED where they are addresses,
 *                 and nothing where they are not (a word such as "uniquelocal").
 * Depends on:     vitest, node:child_process, ops/lib/*.sh
 * Spec:           docs/spec/09-deployment-architecture.md §3
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));

function trusted(proxies: string): string {
  const script = [
    'set -euo pipefail',
    'for lib in common website websiteApply; do source "ops/lib/$lib.sh"; done',
    'SBR_ETC=$(mktemp -d)',
    `printf "SBR_TRUSTED_PROXIES='%s'\\n" '${proxies}' >"$SBR_ETC/prod.env"`,
    'SBR_WEBSITE_MODE=nginx SBR_WEBSITE_UPSTREAM=127.0.0.1:3801 SBR_APP_PORT=3900',
    'SBR_WEBSITE_AUTHORIZE_PATH=/api/games/bingo/authorize SBR_WEBSITE_ROUTES_DIR=/tmp/routes',
    'SECRET_HEADER=X-Sbr-Proxy-Secret',
    'route_settings prod',
    'printf "%s" "${SK_ROUTE_TRUSTED-unset}"',
    'rm -r "$SBR_ETC"',
  ].join('\n');
  const r = spawnSync('bash', ['-c', script], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`route_settings: ${r.stderr}`);
  return r.stdout;
}

describe("the route file's trusted addresses", { timeout: 30_000 }, () => {
  it('are the environment’s, where they are addresses', () => {
    expect(trusted('172.30.249.0/24,10.0.0.1')).toBe('172.30.249.0/24,10.0.0.1');
  });

  it('are left out where the setting is a word', () => {
    expect(trusted('uniquelocal')).toBe('unset');
  });
});
