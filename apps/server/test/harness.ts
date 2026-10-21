/**
 * @file   apps/server/test/harness.ts
 * @module server/test
 * @brief  Integration harness: a Testcontainers PostgreSQL 17, migrations, the Fastify app.
 *
 * Responsibility: start one database per test file, migrate it and build the app with
 *                 test settings (overridable, e.g. NODE_ENV=production or feature flags);
 *                 `buildOn` builds a second app on the same database. Every test file
 *                 stops its own container (12 §7: data created by a test is removed).
 * Depends on:     @testcontainers/postgresql, ../src/index
 * Used by:        ./*.integration.test.ts
 * Spec:           docs/spec/12-testing-strategy.md §2, §7
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { buildApp, createPool, loadEnv, migrate, type App, type DbPool } from '../src/index.js';

// Starting Postgres can be slow on a cold cache, so give each suite a generous ceiling.
export const SUITE_TIMEOUT_MS = 180_000;

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
    SBR_HOST: '127.0.0.1',
    SBR_PORT: '0',
    SBR_LOG_LEVEL: 'warn',
    DATABASE_URL: url,
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

export async function stopHarness(h: Harness): Promise<void> {
  await h.built.fastify.close();
  await h.pool.end();
  await h.container.stop();
}
