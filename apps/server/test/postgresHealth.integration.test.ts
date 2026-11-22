/**
 * @file   apps/server/test/postgresHealth.integration.test.ts
 * @module server/test
 * @brief  The database's healthcheck in ops/compose.yml says ready only for the real server.
 *
 * Responsibility: on a fresh volume the PostgreSQL image first runs a temporary server (local
 *                 socket only) for its init scripts, then stops it and starts the real one. The
 *                 installer's next step (ops/lib/config.sh apply_db_roles: `up --wait`, then
 *                 psql) met the stopping server in the real-site rehearsal of 2026-11-22
 *                 ("the database system is shutting down"). With a slow init script in the
 *                 compose file's own image, the compose file's own healthcheck command must
 *                 fail while the temporary server runs, and pass, with psql working, after.
 * Depends on:     vitest, testcontainers, ops/compose.yml
 * Spec:           docs/spec/09-deployment-architecture.md §3
 */
import { readFileSync } from 'node:fs';

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SUITE_TIMEOUT_MS } from './harness.js';

const COMPOSE = readFileSync(new URL('../../../ops/compose.yml', import.meta.url), 'utf8');
const IMAGE = /image: (postgres:\S+)/.exec(COMPOSE)?.[1] ?? 'missing image';
const HEALTH = /'(pg_isready[^']*)'/.exec(COMPOSE)?.[1] ?? 'missing healthcheck';
// The init script marks that the temporary server runs, then holds it for a while.
const SLOW_INIT = 'touch /tmp/initdb-running\nsleep 15\n';

let db: StartedTestContainer;

async function run(command: string): Promise<number> {
  return (await db.exec(['sh', '-c', command])).exitCode;
}

async function until(command: string, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i += 1) {
    if ((await run(command)) === 0) return true;
    await new Promise((done) => setTimeout(done, 1_000));
  }
  return false;
}

beforeAll(async () => {
  db = await new GenericContainer(IMAGE)
    .withEnvironment({ POSTGRES_USER: 'sbr', POSTGRES_DB: 'sbr', POSTGRES_PASSWORD: 'health' })
    .withCopyContentToContainer([
      { content: SLOW_INIT, target: '/docker-entrypoint-initdb.d/slow.sh' },
    ])
    .start();
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await db.stop();
});

describe('the database healthcheck of ops/compose.yml', () => {
  it(
    'is not ready while the image initialises, and ready with psql working after',
    async () => {
      expect(await until('test -e /tmp/initdb-running', 60)).toBe(true);
      // The temporary server answers on the socket now; the healthcheck must not trust it.
      expect(await run(HEALTH)).not.toBe(0);
      expect(await until(HEALTH, 90)).toBe(true);
      expect(await run('psql -X -q -U sbr -d sbr -c "select 1" >/dev/null')).toBe(0);
    },
    SUITE_TIMEOUT_MS,
  );
});
