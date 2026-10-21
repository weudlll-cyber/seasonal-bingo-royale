/**
 * @file   apps/server/src/match/retention.ts
 * @module server/match
 * @brief  Retention of per-cell marks: 90 days (decided 2026-10-20).
 *
 * Responsibility: delete `marks` rows received more than 90 days ago; scores, entries,
 *                 standings and the event log stay. `startRetention` runs it once at
 *                 start and then every 24 hours.
 * Depends on:     ../db/pool
 * Used by:        ../main
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/03-security-architecture.md §19
 */
import type { DbPool } from '../db/pool.js';

export const MARKS_RETENTION_DAYS = 90;

export async function purgeOldMarks(pool: DbPool, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MARKS_RETENTION_DAYS * 24 * 3600_000);
  const result = await pool.query('DELETE FROM sbr.marks WHERE received_at < $1', [cutoff]);
  return result.rowCount ?? 0;
}

export function startRetention(pool: DbPool): () => void {
  const run = (): void => {
    purgeOldMarks(pool).catch((error: unknown) => {
      console.error('[sbr] marks retention failed:', error);
    });
  };
  run();
  const timer = setInterval(run, 24 * 3600_000);
  return () => {
    clearInterval(timer);
  };
}
