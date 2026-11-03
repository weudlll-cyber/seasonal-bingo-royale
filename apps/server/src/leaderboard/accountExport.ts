/**
 * @file   apps/server/src/leaderboard/accountExport.ts
 * @module server/leaderboard
 * @brief  The caller's own data as one JSON document (GDPR export, 03 §19).
 *
 * Responsibility: the account (e-mail, verification, display name, status, dates, roles),
 *                 every match it played with status, place and score, its league entries and
 *                 awards per period, and its badges. Only for the signed-in account itself;
 *                 password hash and sessions stay out (secrets, not personal history).
 * Depends on:     @sbr/contracts (types), ../db/pool
 * Used by:        ../http/routes/profiles
 * Spec:           docs/spec/03-security-architecture.md §19; docs/spec/05-api-design.md §2.2
 */
import type { AccountExport } from '@sbr/contracts';

import type { DbPool } from '../db/pool.js';

interface AccountRow {
  readonly id: string;
  readonly email: string | null;
  readonly email_verified_at: Date | null;
  readonly display_name: string;
  readonly status: string;
  readonly created_at: Date;
  readonly last_login_at: Date | null;
}

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

export async function accountExport(
  pool: DbPool,
  accountId: string,
  now: Date,
): Promise<AccountExport | null> {
  const found = await pool.query<AccountRow>(
    `SELECT id, email, email_verified_at, display_name, status, created_at, last_login_at
       FROM sbr.accounts WHERE id = $1`,
    [accountId],
  );
  const a = found.rows[0];
  if (a === undefined) return null;
  const roles = await pool.query<{ role_id: string }>(
    'SELECT role_id FROM sbr.role_assignments WHERE account_id = $1 ORDER BY role_id',
    [accountId],
  );
  return {
    exportedAt: now.toISOString(),
    account: {
      id: a.id,
      email: a.email,
      emailVerifiedAt: iso(a.email_verified_at),
      displayName: a.display_name,
      status: a.status,
      createdAt: a.created_at.toISOString(),
      lastLoginAt: iso(a.last_login_at),
      roles: roles.rows.map((r) => r.role_id),
    },
    matches: await matchesOf(pool, accountId),
    ...(await leagueOf(pool, accountId)),
    badges: await badgesOf(pool, accountId),
  };
}

async function matchesOf(pool: DbPool, accountId: string): Promise<AccountExport['matches']> {
  const r = await pool.query<{
    code: string;
    title: string;
    status: string;
    joined_at: Date;
    final_place: number | null;
    score: string;
  }>(
    `SELECT m.code, m.title, m.status, e.joined_at, e.final_place, e.score
       FROM sbr.match_entries e JOIN sbr.matches m ON m.id = e.match_id
      WHERE e.account_id = $1 ORDER BY e.joined_at`,
    [accountId],
  );
  return r.rows.map((row) => ({
    code: row.code,
    title: row.title,
    status: row.status,
    joinedAt: row.joined_at.toISOString(),
    finalPlace: row.final_place,
    // bigint arrives as a string.
    score: Number(row.score),
  }));
}

async function leagueOf(
  pool: DbPool,
  accountId: string,
): Promise<Pick<AccountExport, 'leagueEntries' | 'leagueAwards'>> {
  const entries = await pool.query<AccountExport['leagueEntries'][number]>(
    `SELECT p.name AS period, le.points, le.wins, le.season_completes AS "seasonCompletes",
            le.matches
       FROM sbr.league_entries le JOIN sbr.leaderboard_periods p ON p.id = le.period_id
      WHERE le.account_id = $1 ORDER BY p.starts_at`,
    [accountId],
  );
  const awards = await pool.query<AccountExport['leagueAwards'][number]>(
    `SELECT p.name AS period, m.code AS "matchCode", la.points, la.place
       FROM sbr.league_awards la JOIN sbr.leaderboard_periods p ON p.id = la.period_id
       JOIN sbr.matches m ON m.id = la.match_id
      WHERE la.account_id = $1 ORDER BY la.awarded_at, p.starts_at`,
    [accountId],
  );
  return { leagueEntries: entries.rows, leagueAwards: awards.rows };
}

async function badgesOf(pool: DbPool, accountId: string): Promise<AccountExport['badges']> {
  const r = await pool.query<{ badge: string; match_code: string; awarded_at: Date }>(
    `SELECT b.name AS badge, m.code AS match_code, ba.awarded_at
       FROM sbr.badges_awarded ba JOIN sbr.badges b ON b.id = ba.badge_id
       JOIN sbr.matches m ON m.id = ba.match_id
      WHERE ba.account_id = $1 ORDER BY ba.awarded_at`,
    [accountId],
  );
  return r.rows.map((row) => ({
    badge: row.badge,
    matchCode: row.match_code,
    awardedAt: row.awarded_at.toISOString(),
  }));
}
