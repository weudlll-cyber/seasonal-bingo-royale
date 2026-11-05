/**
 * @file   apps/server/src/leaderboard/boards.ts
 * @module server/leaderboard
 * @brief  Reading the boards: the periods, a page of ranked rows, the caller's row with neighbours.
 *
 * Responsibility: periods with the active ones first (current season, then all-time), then
 *                 closed seasons newest first; a period's rows ordered by league points, then
 *                 wins, then Season Completes (01 §10), then display name, players equal on
 *                 the three sharing a rank (@sbr/application boardRanks, D28), a page at a
 *                 time; the caller's row and up to five rows on either side. Only display
 *                 names leave the database, never account ids.
 * Depends on:     @sbr/application (boardRanks), @sbr/contracts (types), ../db/pool
 * Used by:        ../http/routes/leaderboards
 * Spec:           docs/spec/05-api-design.md §2.4; docs/spec/01-game-design.md §10
 */
import { boardRanks } from '@sbr/application';
import type { LeaderboardPeriod, LeaderboardRow, Step } from '@sbr/contracts';

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

interface EntryRow {
  readonly display_name: string;
  readonly steps: Step[];
  readonly points: number;
  readonly wins: number;
  readonly season_completes: number;
  readonly is_you: boolean;
}

// The counting rule comes from the period's own config snapshot.
const PERIOD_COLUMNS = `id, kind, name, starts_at, ends_at, status,
  (config->>'minPlayersForPoints')::int AS min_players`;

// Every row of a period in board order; $1 the period, $2 the caller's account (or null).
const ORDERED = `
  SELECT a.display_name, a.steps, le.points, le.wins, le.season_completes,
         le.account_id IS NOT DISTINCT FROM $2::uuid AS is_you
    FROM sbr.league_entries le JOIN sbr.accounts a ON a.id = le.account_id
   WHERE le.period_id = $1
   ORDER BY le.points DESC, le.wins DESC, le.season_completes DESC, a.display_name_key`;

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
  const all = await rankedBoard(pool, q.periodId, q.accountId);
  return { rows: all.slice(q.offset, q.offset + q.limit), more: all.length > q.offset + q.limit };
}

// The caller's row and up to `around` rows above and below; empty when it has no entry.
export async function boardAround(
  pool: DbPool,
  q: { periodId: string; accountId: string; around: number },
): Promise<LeaderboardRow[]> {
  const all = await rankedBoard(pool, q.periodId, q.accountId);
  const me = all.findIndex((r) => r.isYou);
  return me < 0 ? [] : all.slice(Math.max(0, me - q.around), me + q.around + 1);
}

// The whole period ranked: a shared rank depends on the rows above, so a page alone cannot
// rank itself.
async function rankedBoard(
  pool: DbPool,
  periodId: string,
  accountId: string | null,
): Promise<LeaderboardRow[]> {
  const r = await pool.query<EntryRow>(ORDERED, [periodId, accountId]);
  const rows = r.rows.map((e) => ({
    displayName: e.display_name,
    points: e.points,
    wins: e.wins,
    seasonCompletes: e.season_completes,
    isYou: e.is_you,
    ...(e.steps.length === 0 ? {} : { steps: e.steps }),
  }));
  const ranks = boardRanks(rows);
  return rows.map((row, i) => ({ rank: ranks[i] ?? i + 1, ...row }));
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
