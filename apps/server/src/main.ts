/**
 * @file   apps/server/src/main.ts
 * @module server
 * @brief  Composition root: loads env, migrates the database, starts Fastify.
 *
 * Responsibility: single entry point used by `pnpm dev`, `node dist/main.js` and the
 *                 Dockerfile `server` command. The integration test imports buildApp
 *                 directly and does not touch this file.
 * Depends on:     ./config/env, ./db/pool, ./db/migrator, ./http/app, ./match/retention
 * Used by:        apps/server/package.json "dev" script
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/08-devops-architecture.md §4
 */
import { loadEnv } from './config/env.js';
import { migrate } from './db/migrator.js';
import { createPool } from './db/pool.js';
import { buildApp } from './http/app.js';
import { startRetention } from './match/retention.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  const applied = await migrate(pool);
  const app = await buildApp({ env, pool });
  if (applied.length > 0) app.fastify.log.info({ migrations: applied }, 'applied migrations');
  await app.fastify.listen({ host: env.SBR_HOST, port: env.SBR_PORT });
  // Timed match commands (draws, window closes, round starts) and the 90-day marks purge.
  const notRecovered = await app.match.startScheduler();
  if (notRecovered.length > 0) app.fastify.log.warn({ notRecovered }, 'matches not continued');
  const stopRetention = startRetention(pool);
  const shutdown = async (): Promise<void> => {
    stopRetention();
    await app.match.scheduler.stop();
    await app.fastify.close();
    await pool.end();
  };
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
}

main().catch((error: unknown) => {
  console.error('[sbr] fatal:', error);
  process.exit(1);
});
