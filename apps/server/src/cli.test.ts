/**
 * @file   apps/server/src/cli.test.ts
 * @module server
 * @brief  The operator commands as the operator runs them: create-super in website mode.
 *
 * Responsibility: in website mode `create-super` refuses with one line before asking for a
 *                 password (website admins are game admins, D41; there is no password sign-in,
 *                 D37), exit code 1, nothing created (it never reaches the database).
 * Depends on:     vitest, node:child_process, ./cli (run as a process, as `sbr admin` does)
 * Spec:           docs/spec/07-integration-architecture.md §2; docs/operator-guide.md §4
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

// The website mode's settings (no database is reached: the URL points nowhere).
const WEBSITE = {
  DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none',
  SBR_AUTH_MODE: 'website',
  SBR_PUBLIC_URL: 'https://example.org/games/bingo/',
  SBR_BASE_PATH: '/games/bingo/',
  SBR_TRUSTED_PROXIES: '127.0.0.1',
  SBR_WEBSITE_PROXY_SECRET: 'ab'.repeat(32),
};

describe('create-super (D41, D37)', () => {
  it('refuses in website mode with one line, before asking for a password', () => {
    const run = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'src/cli.ts',
        'create-super',
        '--email',
        'a@example.org',
        '--name',
        'Chef',
      ],
      { cwd: SERVER_DIR, env: { ...process.env, ...WEBSITE }, input: '', encoding: 'utf8' },
    );
    expect(run.status).toBe(1);
    expect(run.stdout).not.toContain('Password');
    expect(run.stderr.trim()).toBe(
      'Not needed in website mode: website admins are game admins (D41), and there is no password sign-in here (D37).',
    );
    // A new Node process compiling the CLI with tsx: seconds under a full test run.
  }, 30_000);
});
