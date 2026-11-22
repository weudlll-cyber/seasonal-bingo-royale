/**
 * @file   apps/server/src/leaderboard/corrections.ts
 * @module server/leaderboard
 * @brief  League corrections: a delta of league points with a reason, on the boards and profile.
 *
 * Responsibility: `addCorrection` writes, in one transaction, the correction row (the season
 *                 period of now; ../db/migrations/0022), the delta into the player's league
 *                 entries of that season and of the all-time board (an entry made when the
 *                 player has none yet, with no match counted), and its audit entry. A
 *                 correction is never changed or removed: a wrong one is undone by one the other
 *                 way. `correctionsOf` lists a player's corrections for their profile, newest
 *                 first; `recentCorrections` the latest for the admin area's League page.
 * Depends on:     pg (types), @sbr/contracts (types), ../admin/audit, ../db/pool (types),
 *                 ./awards (periodsFor)
 * Used by:        ../http/routes/adminLeague, ./profiles, ./accountExport
 * Spec:           docs/concepts/admin-area.md §4 (League), §6, §9 piece 5
 */
import type { LeaderboardConfig, ProfileCorrection } from '@sbr/contracts';

import { appendAudit } from '../admin/audit.js';
import type { DbPool } from '../db/pool.js';
import { periodsFor } from './awards.js';

export interface Correction {
  readonly accountId: string;
  readonly delta: number;
  readonly reason: string;
  readonly actorAccountId: string;
  readonly requestId: string | null;
  readonly at: number;
  // The league table a season made by this correction starts with.
  readonly config: LeaderboardConfig;
}

export async function addCorrection(pool: DbPool, c: Correction): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const periods = await periodsFor(client, c.at, c.config);
    const row = await client.query<{ id: string }>(
      `INSERT INTO sbr.league_corrections (account_id, season_period_id, delta, reason, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [c.accountId, periods.season, c.delta, c.reason, c.actorAccountId],
    );
    await client.query(
      `INSERT INTO sbr.league_entries AS le (period_id, account_id, points)
       SELECT unnest($1::uuid[]), $2, $3
       ON CONFLICT (period_id, account_id) DO UPDATE
         SET points = le.points + EXCLUDED.points, updated_at = now()`,
      [[periods.season, periods.allTime], c.accountId, c.delta],
    );
    const id = Number(row.rows[0]?.id);
    await appendAudit(client, {
      actorAccountId: c.actorAccountId,
      action: 'league.correct',
      targetType: 'account',
      targetId: c.accountId,
      // The player by account id only: the History reads the name while the account exists.
      diff: { delta: c.delta, reason: c.reason, correction: id },
      requestId: c.requestId,
    });
    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface CorrectionRow {
  readonly id: number;
  readonly player: string | null;
  readonly delta: number;
  readonly reason: string;
  readonly at: number;
}

const LIST = `
  SELECT c.id, a.display_name AS player, c.delta, c.reason, c.created_at
    FROM sbr.league_corrections c JOIN sbr.accounts a ON a.id = c.account_id`;

const rowOf = (r: {
  id: string;
  player: string;
  delta: number;
  reason: string;
  created_at: Date;
}): CorrectionRow => ({
  id: Number(r.id),
  player: r.player,
  delta: r.delta,
  reason: r.reason,
  at: r.created_at.getTime(),
});

// A correction as the player and their profile see it: no admin, no id.
export const publicCorrection = (c: CorrectionRow): ProfileCorrection => ({
  delta: c.delta,
  reason: c.reason,
  at: new Date(c.at).toISOString(),
});

export async function correctionsOf(pool: DbPool, accountId: string): Promise<CorrectionRow[]> {
  const r = await pool.query<Parameters<typeof rowOf>[0]>(
    `${LIST} WHERE c.account_id = $1 ORDER BY c.id DESC LIMIT 50`,
    [accountId],
  );
  return r.rows.map(rowOf);
}

export async function recentCorrections(pool: DbPool): Promise<CorrectionRow[]> {
  const r = await pool.query<Parameters<typeof rowOf>[0]>(`${LIST} ORDER BY c.id DESC LIMIT 20`);
  return r.rows.map(rowOf);
}
