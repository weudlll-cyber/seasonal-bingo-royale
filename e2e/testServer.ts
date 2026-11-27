/**
 * @file   e2e/testServer.ts
 * @module e2e
 * @brief  The game server of the browser tests and load measurements, on a database of its own.
 *
 * Responsibility: locally, starts the dev compose services that are not running (a running one is
 *                 never recreated, so a changed compose file cannot cut a running dev server off
 *                 its database); makes an empty database and data folder; runs the server in this
 *                 process on the tests' port with the development features, its public address the
 *                 tests' client and its mail to Mailpit. The database is thrown away by
 *                 ./globalTeardown, on Ctrl+C when run by hand, and in any case before the next
 *                 start. Run from apps/server: `pnpm test-server`.
 * Depends on:     node:child_process, node:fs, node:path, node:url, ./devStack, ./testDatabase,
 *                 ../apps/server/src/main.ts
 * Used by:        ./playwright.config.ts, ../package.json (`test-server`, for ../load)
 * Spec:           docs/spec/08-devops-architecture.md §1.1; docs/spec/12-testing-strategy.md §4, §5
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CLIENT_URL,
  COMPOSE_FILE,
  ENV_FILE,
  REPO_ROOT,
  SERVER_URL,
  TEST_DATABASE,
  TEST_DATA_DIR,
  externalDatabase,
  mailpit,
} from './devStack.js';
import { dropDatabase, freshDatabase } from './testDatabase.js';

function startServices(): void {
  const compose = ['compose', '--env-file', ENV_FILE, '-f', COMPOSE_FILE];
  const up = ['up', '-d', '--wait', '--no-recreate', 'postgres', 'mailpit'];
  execFileSync('docker', [...compose, ...up], { cwd: REPO_ROOT, stdio: 'inherit' });
}

if (externalDatabase() === undefined) startServices();
rmSync(TEST_DATA_DIR, { recursive: true, force: true });
Object.assign(process.env, {
  DATABASE_URL: freshDatabase(TEST_DATABASE),
  SBR_PORT: new URL(SERVER_URL).port,
  SBR_PUBLIC_URL: `${CLIENT_URL}/`,
  SBR_DATA_DIR: TEST_DATA_DIR,
  // The specs use the development features (quick sign-in, bots, fast rules).
  SBR_DEV: '1',
  SBR_LOG_LEVEL: 'warn',
  // Mail goes to Mailpit, so "Forgot password?" exists (D60).
  SBR_SMTP_HOST: mailpit().smtpHost,
  SBR_SMTP_PORT: mailpit().smtpPort,
});
// By hand: Ctrl+C throws the database away. Playwright ends its server without a signal.
process.once('SIGINT', () => {
  dropDatabase(TEST_DATABASE);
  process.exit(0);
});
await import(pathToFileURL(path.join(REPO_ROOT, 'apps/server/src/main.ts')).href);
