/**
 * @file   apps/server/src/leaderboard/awards.ts
 * @module server/leaderboard
 * @brief  League points and badges of a finished match, written inside its projection transaction (03 §11).
 *
 * Responsibility: on `matchFinished`: the Season Complete badge for every human who completed
 *                 all four seasons in a match without bots (D29); then, when the match counts
 *                 (@sbr/application leagueAwards: flag on, no bots, enough humans — verified ones in website
 *                 mode or with the e-mail switch on, D59) under the League settings in force when
 *                 the match finishes (admin-area §4 "League"),
 *                 one award per player in the season period of the finish time (created when
 *                 first needed, older seasons closed) and in the all-time period. Awards are
 *                 inserted with ON CONFLICT DO NOTHING and only the rows actually inserted add
 *                 to the league entries, so a replay changes nothing.
 * Depends on:     pg (PoolClient), @sbr/application, @sbr/contracts, @sbr/domain (types)
 * Used by:        ../match/projections
 * Spec:           docs/spec/03-security-architecture.md §11; docs/spec/01-game-design.md §8.3, §10;
 *                 docs/spec/04-database-design.md §3.4
 */
import { leagueAwards, seasonPeriodOf, type LeagueEntryInput } from '@sbr/application';
import { LEADERBOARD_DEFAULTS, type LeaderboardConfig } from '@sbr/contracts';
import type { MatchState } from '@sbr/domain';
import type { PoolClient } from 'pg';

interface FinishedMatch {
  readonly matchId: string;
  // When the match finished: the time of the appended `matchFinished` event (epoch ms).
  readonly at: number;
  readonly state: MatchState;
}

interface EntryRow {
  readonly player_id: string;
  readonly account_id: string | null;
  readonly is_bot: boolean;
  readonly verified: boolean;
}

// The league's rules when a match's points are awarded: the admin area's League settings
// (the table, bonuses, fewest players), and whether confirmed e-mail addresses are needed at
// all (website mode, or standalone with the e-mail switch on, D59).
export interface LeagueRules {
  readonly config: LeaderboardConfig;
  readonly needsVerifiedEmail: boolean;
}

// Today's rules: the defaults, confirmed e-mail addresses needed.
export const DEFAULT_LEAGUE_RULES: LeagueRules = {
  config: LEADERBOARD_DEFAULTS,
  needsVerifiedEmail: true,
};

export async function awardFinishedMatch(
  client: PoolClient,
  m: FinishedMatch,
  league: LeagueRules,
): Promise<void> {
  const entries = await leagueEntriesOf(client, m);
  await awardSeasonCompletes(client, m.matchId, entries);
  const flag = await client.query<{ counts_for_leaderboard: boolean }>(
    'SELECT counts_for_leaderboard FROM sbr.matches WHERE id = $1',
    [m.matchId],
  );
  const awards = leagueAwards(
    { countsForLeaderboard: flag.rows[0]?.counts_for_leaderboard === true, entries },
    {
      ...league.config,
      requireVerifiedPlayers: league.config.requireVerifiedPlayers && league.needsVerifiedEmail,
    },
  );
  if (awards.length === 0) return;
  const periods = await periodsFor(client, m.at, league.config);
  for (const periodId of [periods.season, periods.allTime]) {
    await client.query(
      `WITH u AS (
         SELECT * FROM unnest($3::uuid[], $4::int[], $5::int[], $6::boolean[])
           AS u(account_id, points, place, season_complete)),
       inserted AS (
         INSERT INTO sbr.league_awards (period_id, account_id, match_id, points, place)
         SELECT $1, account_id, $2, points, place FROM u
         ON CONFLICT DO NOTHING RETURNING account_id)
       INSERT INTO sbr.league_entries AS le
         (period_id, account_id, points, wins, season_completes, matches)
       SELECT $1, u.account_id, u.points, (u.place = 1)::int, u.season_complete::int, 1
         FROM u JOIN inserted USING (account_id)
       ON CONFLICT (period_id, account_id) DO UPDATE SET
         points = le.points + EXCLUDED.points, wins = le.wins + EXCLUDED.wins,
         season_completes = le.season_completes + EXCLUDED.season_completes,
         matches = le.matches + 1, updated_at = now()`,
      [
        periodId,
        m.matchId,
        awards.map((a) => a.accountId),
        awards.map((a) => a.points),
        awards.map((a) => a.place),
        awards.map((a) => a.seasonComplete),
      ],
    );
  }
}

// Every entry of the match with its final place, read from the state the batch ended in.
async function leagueEntriesOf(client: PoolClient, m: FinishedMatch): Promise<LeagueEntryInput[]> {
  const rows = await client.query<EntryRow>(
    `SELECT e.player_id, e.account_id, e.is_bot, a.email_verified_at IS NOT NULL AS verified
       FROM sbr.match_entries e LEFT JOIN sbr.accounts a ON a.id = e.account_id
      WHERE e.match_id = $1`,
    [m.matchId],
  );
  const place = new Map(m.state.finalPlacement.map((p) => [p.accountId, p.place]));
  const royale = m.state.gameType === 'royale';
  return rows.rows.map((r) => {
    const player = m.state.players[r.player_id];
    return {
      accountId: r.account_id,
      isBot: r.is_bot,
      verified: r.verified,
      place: place.get(r.player_id) ?? null,
      // Finalists exist in royale only: the players never eliminated played the final.
      finalist: royale && player !== undefined && player.eliminatedAtRound === null,
      seasonComplete: player?.seasonCompleteFired === true,
    };
  });
}

// The badge of 01 §8.3, once per player and match, whether or not the match counts for the
// league; never from a match with bots (D29).
async function awardSeasonCompletes(
  client: PoolClient,
  matchId: string,
  entries: readonly LeagueEntryInput[],
): Promise<void> {
  if (entries.some((e) => e.isBot)) return;
  const ids = entries.flatMap((e) =>
    e.seasonComplete && !e.isBot && e.accountId !== null ? [e.accountId] : [],
  );
  if (ids.length === 0) return;
  await client.query(
    `INSERT INTO sbr.badges_awarded (account_id, badge_id, match_id)
     SELECT a, 'season-complete', $1 FROM unnest($2::uuid[]) AS a
     ON CONFLICT DO NOTHING`,
    [matchId, ids],
  );
}

// The season period of the finish time (created on first use, older seasons closed) and
// the all-time period.
// The season period of `at` (created with the league table in force when first needed, older
// seasons closed) and the all-time period; also where a correction goes (./corrections).
export async function periodsFor(
  client: PoolClient,
  at: number,
  config: LeaderboardConfig,
): Promise<{ readonly season: string; readonly allTime: string }> {
  const season = seasonPeriodOf(at);
  await client.query(
    `INSERT INTO sbr.leaderboard_periods (kind, name, starts_at, ends_at, config)
     VALUES ('season', $1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0), $4)
     ON CONFLICT (kind, starts_at) DO NOTHING`,
    [season.name, season.startsAt, season.endsAt, JSON.stringify(config)],
  );
  await client.query(
    `UPDATE sbr.leaderboard_periods SET status = 'closed'
      WHERE kind = 'season' AND status = 'active' AND starts_at < to_timestamp($1 / 1000.0)`,
    [season.startsAt],
  );
  const ids = await client.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM sbr.leaderboard_periods
      WHERE (kind = 'season' AND starts_at = to_timestamp($1 / 1000.0)) OR kind = 'all_time'`,
    [season.startsAt],
  );
  const idOf = (kind: string): string => {
    const row = ids.rows.find((r) => r.kind === kind);
    if (row === undefined) throw new Error(`no ${kind} period`);
    return row.id;
  };
  return { season: idOf('season'), allTime: idOf('all_time') };
}
