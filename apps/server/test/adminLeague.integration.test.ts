/**
 * @file   apps/server/test/adminLeague.integration.test.ts
 * @module server/test
 * @brief  The League section: league values on the settings store, and corrections (piece 5).
 *
 * Responsibility: the League page lists today's values with the schema's limits; an admin changes
 *                 the points of 1st place and the fewest players, and a match finishing afterwards
 *                 is awarded by the new table; a value outside its limit or an unknown key is
 *                 refused. A correction with its reason changes the player's season and all-time
 *                 points, shows on their public profile and in the History by name; a delta of 0, a
 *                 missing reason and an unknown player are refused, an organizer may not correct. A
 *                 correction is never changed (trigger) and goes with the player's account. The
 *                 accounts it registers are removed; the matches finish.
 * Depends on:     vitest, ../src/auth/accounts, ./harness, ./playToEnd, ./session
 * Spec:           docs/concepts/admin-area.md §4 (League), §6, §9 piece 5
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { playToEnd } from './playToEnd.js';
import { signIn, type Client } from './session.js';

let h: Harness;
let admin: Client;
let host: Client;
const made: string[] = [];

beforeAll(async () => {
  h = await startHarness();
  admin = await signIn(h.built.fastify, 'admin');
  host = await signIn(h.built.fastify, 'host');
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  for (const id of made) await deleteAccount(h.pool, id);
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

// A player account with a confirmed e-mail address.
async function player(name: string): Promise<string> {
  const r = await registerAccount(h.pool, {
    email: `${name}@example.com`,
    displayName: name,
    password: 'correct horse battery staple',
  });
  if (!r.ok) throw new Error('registration failed');
  made.push(r.id);
  await h.pool.query('UPDATE sbr.accounts SET email_verified_at = now() WHERE id = $1', [r.id]);
  return r.id;
}

// A classic match that counts, played by `players` to its end; returns its id.
async function play(players: readonly string[]): Promise<string> {
  const engine = h.built.match.engine;
  const created = await host.post('/api/v1/matches', {
    title: 'League values',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 20,
    countsForLeaderboard: true,
  });
  const { id } = created.json<{ id: string }>();
  for (const p of players) await engine.join(id, p, true);
  await engine.start(id, 0);
  await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
  await playToEnd(engine, id);
  return id;
}

const pointsOf = async (accountId: string) =>
  (
    await h.pool.query<{ points: number }>(
      'SELECT points FROM sbr.league_entries WHERE account_id = $1 ORDER BY period_id',
      [accountId],
    )
  ).rows.map((r) => r.points);

describe('the League values (admin-area §4)', () => {
  it('lists today’s values with the limits of the schema', async () => {
    const r = await admin.get('/api/v1/admin/league');
    const { fields } = r.json<{ fields: { path: string; value: unknown; max?: number }[] }>();
    expect(fields.find((f) => f.path === 'place1')).toMatchObject({ value: 100, max: 1_000 });
    expect(fields.find((f) => f.path === 'minPlayersForPoints')?.value).toBe(8);
  });

  it('awards a match finished afterwards by the changed table', async () => {
    const save = await admin.post('/api/v1/admin/league', {
      values: { place1: 150, minPlayersForPoints: 2 },
      comment: 'Bigger wins',
    });
    expect(save.statusCode).toBe(200);
    const id = await play([await player('leaguea1'), await player('leaguea2')]);
    const awards = await h.pool.query<{ points: number; place: number }>(
      'SELECT points, place FROM sbr.league_awards WHERE match_id = $1',
      [id],
    );
    const first = awards.rows.find((a) => a.place === 1);
    expect(first?.points).toBe(150 + 2);
  });

  it('refuses a value outside its limit and a key the League does not have', async () => {
    expect(
      (await admin.post('/api/v1/admin/league', { values: { place1: 5_000 } })).statusCode,
    ).toBe(400);
    expect((await admin.post('/api/v1/admin/league', { values: { other: 1 } })).statusCode).toBe(
      400,
    );
    expect((await host.post('/api/v1/admin/league', { values: { place1: 1 } })).statusCode).toBe(
      403,
    );
  });
});

describe('league corrections (admin-area §4, §6)', () => {
  it('changes the player’s points, shows on the profile and in the History', async () => {
    const id = await player('leaguec1');
    const r = await admin.post('/api/v1/admin/league/corrections', {
      displayName: 'leaguec1',
      delta: 25,
      reason: 'Points of the broken match',
    });
    expect(r.statusCode).toBe(201);
    expect(await pointsOf(id)).toEqual([25, 25]);
    const profile = await host.get('/api/v1/players/leaguec1');
    expect(profile.json()).toMatchObject({
      corrections: [{ delta: 25, reason: 'Points of the broken match' }],
    });
    const history = await admin.get('/api/v1/admin/history');
    const [last] = history.json<{ entries: { action: string; target: string }[] }>().entries;
    expect(last).toMatchObject({ action: 'league.correct', target: 'leaguec1' });
  });

  it('refuses a zero delta, no reason, an unknown player and an organizer', async () => {
    const path = '/api/v1/admin/league/corrections';
    const ok = { displayName: 'leaguec1', delta: 5, reason: 'Because' };
    expect((await admin.post(path, { ...ok, delta: 0 })).statusCode).toBe(400);
    expect((await admin.post(path, { ...ok, reason: '' })).statusCode).toBe(400);
    expect((await admin.post(path, { ...ok, displayName: 'nobody-here' })).statusCode).toBe(404);
    expect((await host.post(path, ok)).statusCode).toBe(403);
  });

  it('is never changed and goes with the account', async () => {
    await expect(h.pool.query('UPDATE sbr.league_corrections SET delta = 1')).rejects.toThrow(
      /never changed/,
    );
    const id = made.pop();
    if (id === undefined) throw new Error('no account');
    await deleteAccount(h.pool, id);
    const left = await h.pool.query('SELECT 1 FROM sbr.league_corrections WHERE account_id = $1', [
      id,
    ]);
    expect(left.rowCount).toBe(0);
  });
});
