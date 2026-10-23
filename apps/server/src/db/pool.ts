/**
 * @file   apps/server/src/db/pool.ts
 * @module server/db
 * @brief  Lightweight wrapper around node-postgres with a single pool per server.
 *
 * Responsibility: create and dispose a pg.Pool, expose a readiness probe used by
 *                 /readyz. The pool is kept small for dev (max 10) and left to the
 *                 operator to tune for production via DATABASE_URL's `max=` query.
 * Depends on:     pg
 * Used by:        ../main.ts, ../http/app.ts, ../http/routes/health.ts, ./migrator.ts,
 *                 ../auth/accounts, ../auth/sessionPlugin, ../auth/sessions, ../cli,
 *                 ../http/routes/auth, ../http/routes/devSignIn, ../http/routes/matches,
 *                 ../index, ../match/pgMatchStore, ../match/pgScheduler, ../match/retention,
 *                 ../match/runtime, ../realtime/gateway
 * Spec:           docs/spec/04-database-design.md §1, docs/spec/02-software-architecture.md §7
 */
import pg from 'pg';

const { Pool } = pg;

export type DbPool = pg.Pool;

export function createPool(databaseUrl: string): DbPool {
  // application_name tags connections in pg_stat_activity so an operator can see which
  // server is talking to this database.
  return new Pool({ connectionString: databaseUrl, application_name: 'sbr-server', max: 10 });
}

export async function pingDatabase(pool: DbPool): Promise<void> {
  // `SELECT 1` keeps the probe cheap and sidesteps planner hints on empty tables.
  await pool.query('SELECT 1');
}
