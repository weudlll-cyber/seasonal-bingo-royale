/**
 * @file   apps/server/src/leaderboard/profiles.ts
 * @module server/leaderboard
 * @brief  A player's public profile, read from the match entries, league awards and badges (01 §10).
 *
 * Responsibility: by display name (case-insensitive): matches played, wins and best placement
 *                 over every finished match the account played (also those with bots, which
 *                 never count for the league), Season Completes and the badges, and the last
 *                 10 finished matches with their place, player count and whether they gave
 *                 league points or why not. Computed on read; no e-mail, real name or id.
 * Depends on:     @sbr/contracts (types), ../db/pool
 * Used by:        ../http/routes/profiles
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/05-api-design.md §2.2
 */
import type { LeagueOutcome, PlayerProfile, ProfileBadge, ProfileMatch } from '@sbr/contracts';

import type { DbPool } from '../db/pool.js';

const RECENT = 10;

// The first that applies (contracts LeagueOutcome); `e` the entry, `m` its match.
const LEAGUE_OUTCOME = `CASE
  WHEN EXISTS (SELECT 1 FROM sbr.league_awards la
                WHERE la.match_id = m.id AND la.account_id = e.account_id) THEN 'counted'
  WHEN NOT m.counts_for_leaderboard THEN 'switchOff'
  WHEN EXISTS (SELECT 1 FROM sbr.match_entries b WHERE b.match_id = m.id AND b.is_bot) THEN 'bots'
  WHEN EXISTS (SELECT 1 FROM sbr.league_awards la WHERE la.match_id = m.id) THEN 'notVerified'
  ELSE 'tooFewPlayers' END`;

export async function playerProfile(
  pool: DbPool,
  displayName: string,
): Promise<PlayerProfile | null> {
  const found = await pool.query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM sbr.accounts WHERE display_name_key = $1',
    [displayName],
  );
  const account = found.rows[0];
  if (account === undefined) return null;
  const totals = await pool.query<{ played: number; wins: number; best: number | null }>(
    `SELECT count(*)::int AS played, count(*) FILTER (WHERE e.final_place = 1)::int AS wins,
            min(e.final_place) AS best
       FROM sbr.match_entries e JOIN sbr.matches m ON m.id = e.match_id
      WHERE e.account_id = $1 AND m.status = 'finished'`,
    [account.id],
  );
  const badges = await badgesOf(pool, account.id);
  const t = totals.rows[0];
  return {
    displayName: account.display_name,
    matchesPlayed: t?.played ?? 0,
    wins: t?.wins ?? 0,
    bestPlacement: t?.best ?? null,
    seasonCompletes: badges.find((b) => b.id === 'season-complete')?.count ?? 0,
    badges,
    recentMatches: await recentMatches(pool, account.id),
  };
}

async function badgesOf(pool: DbPool, accountId: string): Promise<ProfileBadge[]> {
  const r = await pool.query<ProfileBadge>(
    `SELECT b.id, b.name, count(*)::int AS count
       FROM sbr.badges_awarded ba JOIN sbr.badges b ON b.id = ba.badge_id
      WHERE ba.account_id = $1 GROUP BY b.id, b.name ORDER BY b.name`,
    [accountId],
  );
  return r.rows;
}

async function recentMatches(pool: DbPool, accountId: string): Promise<ProfileMatch[]> {
  const r = await pool.query<{
    code: string;
    title: string;
    finished_at: Date | null;
    final_place: number | null;
    players: number;
    league: LeagueOutcome;
  }>(
    `SELECT m.code, m.title, m.finished_at, e.final_place,
            (SELECT count(*) FROM sbr.match_entries x WHERE x.match_id = m.id)::int AS players,
            ${LEAGUE_OUTCOME} AS league
       FROM sbr.match_entries e JOIN sbr.matches m ON m.id = e.match_id
      WHERE e.account_id = $1 AND m.status = 'finished'
      ORDER BY m.finished_at DESC NULLS LAST LIMIT $2`,
    [accountId, RECENT],
  );
  return r.rows.map((row) => ({
    code: row.code,
    title: row.title,
    finishedAt: row.finished_at?.toISOString() ?? null,
    place: row.final_place,
    players: row.players,
    league: row.league,
  }));
}
