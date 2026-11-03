/**
 * @file   apps/server/test/myMatches.integration.test.ts
 * @module server/test
 * @brief  GET /api/v1/me/matches: the signed-in player's matches that are not over (D39).
 *
 * Responsibility: player-1 joins a realtime lobby the host starts, one with a set start time, an
 *                 asynchronous lobby and an asynchronous royale a day into play; a cancelled
 *                 match and one player-1 never joined stay out. The list is newest first with
 *                 the start facts, the round and the cuts as the event log has them, read in one
 *                 query; player-2 sees only their own match; a guest 401. Open matches are
 *                 aborted at the end (./harness stopHarness).
 * Depends on:     vitest, ./harness, ./session
 * Spec:           docs/spec/05-api-design.md §2.2; docs/spec/01-game-design.md §13 (D39)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

const DAY = 86_400_000;
let harness: Harness;
let host: Client;
let player: Client;
let other: Client;

beforeAll(async () => {
  harness = await startHarness();
  host = await signIn(harness.built.fastify, 'host');
  player = await signIn(harness.built.fastify, 'player-1');
  other = await signIn(harness.built.fastify, 'player-2');
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const royale = {
  gameType: 'royale',
  drawMode: 'auto',
  missedNumbers: { kind: 'noAutoMark' },
  maxPlayers: 10,
};

async function created(body: object): Promise<{ code: string; id: string }> {
  const r = await host.post('/api/v1/matches', { ...royale, ...body });
  expect(r.statusCode).toBe(201);
  return r.json<{ code: string; id: string }>();
}

async function joined(by: Client, body: object): Promise<{ code: string; id: string }> {
  const match = await created(body);
  expect((await by.post(`/api/v1/matches/${match.code}/join`, {})).statusCode).toBe(204);
  return match;
}

interface Listed {
  readonly code: string;
  readonly mode: string;
  readonly status: string;
  readonly startAt: number | null;
  readonly lobbyClosesAt: number | null;
  readonly roundIndex: number | null;
  readonly cutsSurvived: number;
  readonly outInCut: number | null;
}

const listOf = async (by: Client) =>
  (await by.get('/api/v1/me/matches')).json<{ matches: Listed[] }>().matches;

// The round and cuts of player-1 in a match, from its event log (the list's oracle).
async function logFacts(id: string, me: string) {
  const log = (await harness.built.match.store.events(id, 0)).map((e) => e.event);
  const rounds = log.flatMap((e) => (e.type === 'roundStarted' ? [e.roundIndex] : []));
  const cuts = log.flatMap((e) => (e.type === 'cutApplied' ? [e] : []));
  const out = cuts.findIndex((c) => c.eliminated.includes(me));
  return {
    roundIndex: rounds.length === 0 ? null : Math.max(...rounds),
    cutsSurvived: cuts.filter((c) => c.survivors.includes(me)).length,
    outInCut: out < 0 ? null : out + 1,
  };
}

describe('my matches (D39)', () => {
  it("lists the player's matches that are not over, newest first, in one query", async () => {
    const hostRule = await joined(player, { title: 'Host starts' });
    const at = Date.now() + 3_600_000;
    const setTime = await joined(player, {
      title: 'Set time',
      startRule: { kind: 'at', at, auto: false },
    });
    const slowLobby = await joined(player, {
      title: 'Slow lobby',
      mode: 'async',
      quietHours: null,
    });
    const slow = await joined(player, { title: 'Slow', mode: 'async', quietHours: null });
    const cancelled = await joined(player, { title: 'Cancelled' });
    const notMine = await joined(other, { title: 'Not mine' });
    const engine = harness.built.match.engine;
    await engine.abort(cancelled.id, 'test cleanup', 'host');
    await engine.fillWithBots(slow.id, 10);
    await engine.start(slow.id, 0);
    const travel = await host.post('/api/v1/dev/time-travel', { code: slow.code, ms: DAY });
    expect(travel.statusCode).toBe(200);
    const queries = vi.spyOn(harness.pool, 'query');
    const list = await listOf(player);
    const reads = queries.mock.calls.filter(([sql]) => sql.includes('match_entries'));
    queries.mockRestore();
    expect(reads).toHaveLength(1);
    expect(list.map((m) => m.code)).toEqual([
      slow.code,
      slowLobby.code,
      setTime.code,
      hostRule.code,
    ]);
    const [running, lobby, timed, plain] = list;
    const me = (await engine.runner.current(slow.id)).state.playerOrder.find(
      (p) => !p.startsWith('bot-'),
    );
    expect(running).toMatchObject({ mode: 'async', status: 'running' });
    expect(running).toMatchObject(await logFacts(slow.id, me ?? ''));
    expect(running?.roundIndex).not.toBeNull();
    expect(lobby).toMatchObject({ mode: 'async', status: 'lobby', roundIndex: null });
    expect(lobby?.lobbyClosesAt).toBeGreaterThan(Date.now());
    expect(timed).toMatchObject({ mode: 'realtime', status: 'lobby', startAt: at });
    expect(plain).toMatchObject({ startAt: null, lobbyClosesAt: null, cutsSurvived: 0 });
    // Only the session's own matches.
    expect((await listOf(other)).map((m) => m.code)).toEqual([notMine.code]);
  }, 180_000);

  it('asks a guest to sign in', async () => {
    const guest = await harness.built.fastify.inject({ method: 'GET', url: '/api/v1/me/matches' });
    expect(guest.statusCode).toBe(401);
  });
});
