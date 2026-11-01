/**
 * @file   apps/server/src/leaderboard/boards.ts
 * @module server/leaderboard
 * @brief  Reading the boards: the periods, a page of ranked rows, the caller's row with neighbours.
 *
 * Responsibility: periods with the active ones first (current season, then all-time), then
 *                 closed seasons newest first; a period's rows ranked by league points, then
 *                 wins, then Season Completes (01 §10), then display name so every row has its
 *                 own rank, a page at a time; the caller's row and up to five rows on either
 *                 side. Only display names leave the database, never account ids.
 * Depends on:     @sbr/contracts (types), ../db/pool
 * Used by:        ../http/routes/leaderboards
 * Spec:           docs/spec/05-api-design.md §2.4; docs/spec/01-game-design.md §10
 */
import type { LeaderboardPeriod, LeaderboardRow } from '@sbr/contracts';

import type { DbPool } from '../db/pool.js';

interface PeriodRow {
  readonly id: string;
  readonly kind: LeaderboardPeriod['kind'];
  readonly name: string;
  readonly starts_at: Date;
  readonly ends_at: Date | null;
  readonly status: LeaderboardPeriod['status'];
  readonly min_players: number;
}

interface RankedRow {
  readonly rank: string;
  readonly display_name: string;
  readonly points: number;
  readonly wins: number;
  readonly season_completes: number;
  readonly is_you: boolean;
}

// The counting rule comes from the period's own config snapshot.
const PERIOD_COLUMNS = `id, kind, name, starts_at, ends_at, status,
  (config->>'minPlayersForPoints')::int AS min_players`;

// Every row of a period with its rank; $1 the period, $2 the caller's account (or null).
const RANKED = `
  SELECT a.display_name, le.points, le.wins, le.season_completes,
         le.account_id IS NOT DISTINCT FROM $2::uuid AS is_you,
         row_number() OVER (ORDER BY le.points DESC, le.wins DESC, le.season_completes DESC,
                                     a.display_name_key) AS rank
    FROM sbr.league_entries le JOIN sbr.accounts a ON a.id = le.account_id
   WHERE le.period_id = $1`;

export async function listPeriods(pool: DbPool): Promise<LeaderboardPeriod[]> {
  const r = await pool.query<PeriodRow>(
    `SELECT ${PERIOD_COLUMNS} FROM sbr.leaderboard_periods
      ORDER BY status = 'active' DESC, kind = 'season' DESC, starts_at DESC`,
  );
  return r.rows.map(periodOf);
}

export async function findPeriod(pool: DbPool, id: string): Promise<LeaderboardPeriod | null> {
  const r = await pool.query<PeriodRow>(
    `SELECT ${PERIOD_COLUMNS} FROM sbr.leaderboard_periods WHERE id = $1`,
    [id],
  );
  const row = r.rows[0];
  return row === undefined ? null : periodOf(row);
}

// `limit` rows from `offset`, and whether more follow.
export async function boardPage(
  pool: DbPool,
  q: { periodId: string; accountId: string | null; offset: number; limit: number },
): Promise<{ rows: LeaderboardRow[]; more: boolean }> {
  const r = await pool.query<RankedRow>(
    `SELECT * FROM (${RANKED}) ranked ORDER BY rank LIMIT $3 OFFSET $4`,
    [q.periodId, q.accountId, q.limit + 1, q.offset],
  );
  return { rows: r.rows.slice(0, q.limit).map(rowOf), more: r.rows.length > q.limit };
}

// The caller's row and up to `around` rows above and below; empty when it has no entry.
export async function boardAround(
  pool: DbPool,
  q: { periodId: string; accountId: string; around: number },
): Promise<LeaderboardRow[]> {
  const r = await pool.query<RankedRow>(
    `WITH ranked AS (${RANKED}),
          me AS (SELECT rank FROM ranked WHERE is_you)
     SELECT ranked.* FROM ranked, me
      WHERE ranked.rank BETWEEN me.rank - $3 AND me.rank + $3
      ORDER BY ranked.rank`,
    [q.periodId, q.accountId, q.around],
  );
  return r.rows.map(rowOf);
}

function periodOf(r: PeriodRow): LeaderboardPeriod {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at?.toISOString() ?? null,
    status: r.status,
    minPlayers: r.min_players,
  };
}

function rowOf(r: RankedRow): LeaderboardRow {
  return {
    rank: Number(r.rank),
    displayName: r.display_name,
    points: r.points,
    wins: r.wins,
    seasonCompletes: r.season_completes,
    isYou: r.is_you,
  };
}
