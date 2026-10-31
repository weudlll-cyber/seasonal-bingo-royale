/**
 * @file   apps/server/test/harness.ts
 * @module server/test
 * @brief  Integration harness: a Testcontainers PostgreSQL 17, migrations, the Fastify app.
 *
 * Responsibility: start one database per test file, migrate it and build the app with
 *                 test settings (overridable, e.g. NODE_ENV=production or feature flags) and
 *                 one seed key for every app on the database;
 *                 `buildOn` builds a second app on the same database. Every test file
 *                 aborts the matches it left open and stops its own container (12 §7:
 *                 data created by a test is removed), also when a test failed; the suites
 *                 that create guests remove their guest sessions (removeGuests).
 * Depends on:     @testcontainers/postgresql, ../src/index
 * Used by:        ./*.integration.test.ts
 * Spec:           docs/spec/12-testing-strategy.md §2, §7
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { buildApp, createPool, loadEnv, migrate, type App, type DbPool } from '../src/index.js';

// Starting Postgres can be slow on a cold cache, so give each suite a generous ceiling.
export const SUITE_TIMEOUT_MS = 180_000;

// One seed key for every app on a suite's database, development and production builds
// alike: the stored match secrets are sealed with it, and another key refuses to start.
export const TEST_SEED_KEY = 'ab'.repeat(32);

export interface Harness {
  readonly container: StartedPostgreSqlContainer;
  readonly pool: DbPool;
  readonly built: App;
  readonly applied: readonly string[];
}

export async function buildOn(
  pool: DbPool,
  url: string,
  overrides: Record<string, string> = {},
): Promise<App> {
  const env = loadEnv({
    NODE_ENV: 'test',
    // The suites use the development features (quick sign-in, bots); production tests
    // pass SBR_DEV: '0'.
    SBR_DEV: '1',
    SBR_HOST: '127.0.0.1',
    SBR_PORT: '0',
    SBR_LOG_LEVEL: 'warn',
    DATABASE_URL: url,
    SBR_SEED_KEY: TEST_SEED_KEY,
    ...overrides,
  });
  const built = await buildApp({ env, pool });
  await built.fastify.ready();
  return built;
}

export async function startHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const pool = createPool(container.getConnectionUri());
  const applied = await migrate(pool);
  const built = await buildOn(pool, container.getConnectionUri(), overrides);
  return { container, pool, built, applied };
}

// Every match the suite left in the lobby or running is aborted ("test cleanup") before
// the app closes; stopHarness runs in each suite's afterAll, so also after a failed test.
export async function stopOpenMatches(h: Harness): Promise<string[]> {
  const open = await h.pool.query<{ id: string }>(
    `SELECT id FROM sbr.matches WHERE status IN ('lobby', 'running')`,
  );
  for (const { id } of open.rows) {
    // A second app on the same database (buildOn) may have moved the match on: the first
    // try then meets a version conflict, drops the stale cache, and the retry reloads.
    await h.built.match.engine
      .abort(id, 'test cleanup', 'system')
      .catch(() => h.built.match.engine.abort(id, 'test cleanup', 'system'));
  }
  return open.rows.map((r) => r.id);
}

// A guest has no account: its session row is all a guest is. The suites that create guests
// remove them at the end (12 §7); every guest session in the suite's own database is one
// the suite created.
export async function removeGuests(h: Harness): Promise<void> {
  await h.pool.query("DELETE FROM sbr.sessions WHERE kind = 'guest'");
}

// How many guest sessions the suite's database holds (none once removeGuests ran).
export async function guestSessions(h: Harness): Promise<number> {
  const r = await h.pool.query("SELECT 1 FROM sbr.sessions WHERE kind = 'guest'");
  return r.rowCount ?? 0;
}

export async function stopHarness(h: Harness): Promise<void> {
  await stopOpenMatches(h);
  await h.built.fastify.close();
  await h.pool.end();
  await h.container.stop();
}
