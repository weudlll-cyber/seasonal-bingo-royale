/**
 * @file   apps/server/test/leaderboard.integration.test.ts
 * @module server/test
 * @brief  League points are awarded once, only by matches that count; boards, profile, export, deletion.
 *
 * Responsibility: classic matches (leaderboard flag on) played to their end through the engine:
 *                 8 verified humans award points in the season and the all-time period;
 *                 running the finish projection again, also on a second app after a "restart",
 *                 changes nothing; 7 verified humans, a bot among 8, or one unverified among 8
 *                 award nothing (03 §11). The board (equal players share a rank, D28), the
 *                 caller's row, the public profile (figures without the bot match, which stays
 *                 listed, D29) and the export show it; Season Complete badges are given once
 *                 and never by a bot match; DELETE /me removes the account's league rows.
 * Depends on:     ../src/auth/*, ../src/leaderboard/awards, ./harness, ./playToEnd, ./session
 * Spec:           docs/spec/03-security-architecture.md §11; docs/spec/01-game-design.md §8.3, §10;
 *                 docs/spec/04-database-design.md §3.4; docs/spec/05-api-design.md §2.2, §2.4
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { createSession } from '../src/auth/sessions.js';
import { awardFinishedMatch } from '../src/leaderboard/awards.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { playToEnd } from './playToEnd.js';
import { signIn, type Client } from './session.js';

const PASSWORD = 'correct horse battery staple';
let harness: Harness;
let host: Client;
const made: string[] = [];

beforeAll(async () => {
  harness = await startHarness();
  host = await signIn(harness.built.fastify, 'host');
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const id of made) await deleteAccount(harness.pool, id);
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

// A new player account, its e-mail confirmed or not.
// Numbers the accounts (the deletion test removes one from `made`).
let registered = 0;
async function account(verified: boolean): Promise<string> {
  registered += 1;
  const n = registered;
  const r = await registerAccount(harness.pool, {
    email: `league-${String(n)}@example.com`,
    displayName: `league${String(n)}`,
    password: PASSWORD,
  });
  if (!r.ok) throw new Error('registration failed');
  made.push(r.id);
  if (verified) {
    await harness.pool.query('UPDATE sbr.accounts SET email_verified_at = now() WHERE id = $1', [
      r.id,
    ]);
  }
  return r.id;
}

const accounts = async (n: number, verified = true) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) ids.push(await account(verified));
  return ids;
};

// A classic match that counts for the leaderboard, joined by `players` (and `bots` bots),
// played to its end; returns the match id.
async function play(
  players: readonly string[],
  bots = 0,
  engine = harness.built.match.engine,
): Promise<string> {
  const created = await host.post('/api/v1/matches', {
    title: 'League match',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 20,
    countsForLeaderboard: true,
  });
  const { id } = created.json<{ id: string }>();
  for (const p of players) await engine.join(id, p, true);
  if (bots > 0) await engine.fillWithBots(id, players.length + bots);
  await engine.start(id, 0);
  await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
  await playToEnd(engine, id);
  return id;
}

const awardsOf = async (matchId: string) =>
  (await harness.pool.query('SELECT 1 FROM sbr.league_awards WHERE match_id = $1', [matchId]))
    .rowCount;

async function entries(): Promise<Record<string, unknown>[]> {
  const r = await harness.pool.query<Record<string, unknown>>(
    `SELECT period_id, account_id, points, wins, season_completes, matches
       FROM sbr.league_entries ORDER BY period_id, account_id`,
  );
  return r.rows;
}

// The finish projection once more, as a replay would run it, on `app`'s store.
async function projectFinishAgain(matchId: string, app = harness.built): Promise<void> {
  const loaded = await app.match.store.load(matchId);
  if (loaded === null) throw new Error('match not found');
  const client = await harness.pool.connect();
  try {
    await client.query('BEGIN');
    await awardFinishedMatch(client, { matchId, at: Date.now(), state: loaded.state }, true);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

// The finish projection of `matchId` once more, with `who` having completed all four seasons.
async function projectSeasonComplete(matchId: string, who: string): Promise<void> {
  const loaded = await harness.built.match.store.load(matchId);
  const p = loaded?.state.players[who];
  if (loaded === null || p === undefined) throw new Error('match or player not found');
  const state = {
    ...loaded.state,
    players: { ...loaded.state.players, [who]: { ...p, seasonCompleteFired: true } },
  };
  const client = await harness.pool.connect();
  try {
    await client.query('BEGIN');
    await awardFinishedMatch(client, { matchId, at: Date.now(), state }, true);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

async function clientOf(accountId: string) {
  const s = await createSession(harness.pool, accountId, null);
  const headers = { cookie: `sbr_session=${s.token}`, 'x-csrf-token': s.csrfToken };
  const app = harness.built.fastify;
  return {
    get: (url: string) => app.inject({ method: 'GET', url, headers }),
    delete: (url: string, body: object) =>
      app.inject({ method: 'DELETE', url, headers, payload: body }),
  };
}

// The match that counted and its 8 players, and the match with a bot, shared by the tests
// below (they run in order).
let counted = '';
let withBot = '';
let players: string[] = [];

describe('league points (03 §11, 01 §10)', () => {
  it('a match of 8 verified humans awards once, in the season and the all-time period', async () => {
    players = await accounts(8);
    counted = await play(players);
    expect(await awardsOf(counted)).toBe(16);
    const before = await entries();
    expect(before).toHaveLength(16);
    const periods = await harness.pool.query<{ kind: string; status: string }>(
      'SELECT kind, status FROM sbr.leaderboard_periods ORDER BY kind',
    );
    expect(periods.rows).toEqual([
      { kind: 'all_time', status: 'active' },
      { kind: 'season', status: 'active' },
    ]);
    // A replay of the finish, and the same after a restart (a second app on the database).
    await projectFinishAgain(counted);
    const restarted = await buildOn(harness.pool, harness.container.getConnectionUri());
    await projectFinishAgain(counted, restarted);
    await restarted.fastify.close();
    expect(await awardsOf(counted)).toBe(16);
    expect(await entries()).toEqual(before);
  });

  it('7 verified humans award nothing', async () => {
    expect(await awardsOf(await play(players.slice(0, 7)))).toBe(0);
  });

  it('a bot among 8 verified humans awards nothing', async () => {
    withBot = await play(players, 1);
    expect(await awardsOf(withBot)).toBe(0);
  });
});

describe('what the players see (05 §2.2, §2.4)', () => {
  it('shows the board with shared ranks and the own row', async () => {
    const me = await clientOf(players[0] ?? '');
    const periods = (await me.get('/api/v1/leaderboards')).json<{
      items: { id: string; kind: string }[];
    }>().items;
    expect(periods.map((p) => p.kind)).toEqual(['season', 'all_time']);
    const season = periods[0]?.id ?? '';
    const board = (await me.get(`/api/v1/leaderboards/${season}`)).json<{
      items: { rank: number; points: number; isYou: boolean }[];
      nextCursor: string | null;
    }>();
    // Places 4 to 8 earn the same points, no wins, no Season Completes: one shared rank (D28).
    expect(board.items.map((r) => r.rank)).toEqual([1, 2, 3, 4, 4, 4, 4, 4]);
    expect(board.items[0]?.points).toBeGreaterThanOrEqual(board.items[7]?.points ?? 0);
    expect(board.items.filter((r) => r.isYou)).toHaveLength(1);
    expect(board.nextCursor).toBeNull();
    const around = (await me.get(`/api/v1/leaderboards/${season}/me`)).json<{
      items: { isYou: boolean }[];
    }>();
    expect(around.items.some((r) => r.isYou)).toBe(true);
    expect((await me.get('/api/v1/leaderboards/not-a-period')).statusCode).toBe(404);
  });

  it('shows the profile without the bot match in its figures, and the export', async () => {
    const me = await clientOf(players[0] ?? '');
    const profile = (await me.get('/api/v1/players/LEAGUE1')).json<{
      displayName: string;
      matchesPlayed: number;
      wins: number;
      bestPlacement: number | null;
      recentMatches: { league: string }[];
    }>();
    expect(profile.displayName).toBe('league1');
    // The bot match does not count in the figures (D29) but is listed below.
    expect(profile.matchesPlayed).toBe(2);
    const places = await harness.pool.query<{ final_place: number }>(
      'SELECT final_place FROM sbr.match_entries WHERE account_id = $1 AND match_id <> $2',
      [players[0], withBot],
    );
    const own = places.rows.map((r) => r.final_place);
    expect(profile.wins).toBe(own.filter((place) => place === 1).length);
    expect(profile.bestPlacement).toBe(Math.min(...own));
    // Newest first: a bot, 7 players, the match that counted (the unverified ones come later).
    expect(profile.recentMatches.map((m) => m.league)).toEqual([
      'bots',
      'tooFewPlayers',
      'counted',
    ]);
    expect(JSON.stringify(profile)).not.toContain('@example.com');
    const data = (await me.get('/api/v1/me/export')).json<{
      account: { email: string };
      matches: unknown[];
      leagueAwards: unknown[];
    }>();
    expect(data.account.email).toBe('league-1@example.com');
    expect([data.matches.length, data.leagueAwards.length]).toEqual([3, 2]);
  });
});

describe('Discord steps on the board and the profile (2026-11-04)', () => {
  it('shows the steps an account has next to its name, and none for the others', async () => {
    const golden = [{ ladder: 'holder', name: 'Golden', icon: '/media/g.webp' }];
    await harness.pool.query('UPDATE sbr.accounts SET steps = $2::jsonb WHERE id = $1', [
      players[1],
      JSON.stringify(golden),
    ]);
    const me = await clientOf(players[0] ?? '');
    const season = (await me.get('/api/v1/leaderboards')).json<{ items: { id: string }[] }>()
      .items[0]?.id;
    const board = (await me.get(`/api/v1/leaderboards/${season ?? ''}`)).json<{
      items: { displayName: string; steps?: unknown }[];
    }>();
    expect(board.items.filter((r) => r.steps !== undefined)).toEqual([
      expect.objectContaining({ displayName: 'league2', steps: golden }),
    ]);
    const profile = (await me.get('/api/v1/players/league2')).json<{ steps?: unknown }>();
    expect(profile.steps).toEqual(golden);
    expect((await me.get('/api/v1/players/league1')).json<{ steps?: unknown }>().steps).toBe(
      undefined,
    );
  });
});

describe('badges and account deletion (01 §8.3, 05 §2.2)', () => {
  it('gives a Season Complete badge once per player and match, counted or not', async () => {
    const who = players[1] ?? '';
    for (let i = 0; i < 2; i += 1) await projectSeasonComplete(counted, who);
    const badges = await harness.pool.query(
      'SELECT account_id FROM sbr.badges_awarded WHERE match_id = $1',
      [counted],
    );
    expect(badges.rows).toEqual([{ account_id: who }]);
  });

  it('gives no Season Complete badge for a match with bots (D29)', async () => {
    await projectSeasonComplete(withBot, players[2] ?? '');
    const badges = await harness.pool.query(
      'SELECT 1 FROM sbr.badges_awarded WHERE match_id = $1',
      [withBot],
    );
    expect(badges.rowCount).toBe(0);
  });

  it('DELETE /me removes the league rows and badges of the account', async () => {
    const who = players[1] ?? '';
    const r = await (await clientOf(who)).delete('/api/v1/me', { password: PASSWORD });
    expect(r.statusCode).toBe(204);
    made.splice(made.indexOf(who), 1);
    for (const table of ['league_entries', 'league_awards', 'badges_awarded']) {
      const left = await harness.pool.query(`SELECT 1 FROM sbr.${table} WHERE account_id = $1`, [
        who,
      ]);
      expect(left.rowCount, table).toBe(0);
    }
    expect(await awardsOf(counted)).toBe(14);
  });
});

describe('league points without confirmed e-mail addresses (D59)', () => {
  it('one unverified player among 8 counts in a standalone install (D59)', async () => {
    const unverified = await account(false);
    expect(await awardsOf(await play([...(await accounts(7)), unverified]))).toBe(16);
  });

  it('with SBR_FEATURE_EMAIL_VERIFICATION on, one unverified among 8 awards nothing', async () => {
    const strict = await buildOn(harness.pool, harness.container.getConnectionUri(), {
      SBR_FEATURE_EMAIL_VERIFICATION: '1',
    });
    try {
      const unverified = await account(false);
      const id = await play([...(await accounts(7)), unverified], 0, strict.match.engine);
      expect(await awardsOf(id)).toBe(0);
    } finally {
      await strict.fastify.close();
    }
  });
});
