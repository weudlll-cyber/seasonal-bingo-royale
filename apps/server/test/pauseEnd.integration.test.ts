/**
 * @file   apps/server/test/pauseEnd.integration.test.ts
 * @module server/test
 * @brief  The host ends a timed pause between royale rounds early (D21).
 *
 * Responsibility: royales (fast test profile, 60-second pause) played to the first cut.
 *                 Outside the pause the host is refused; in it a player and another host are
 *                 refused and the host starts round 2 at once for every viewer: one start in
 *                 the log after the pause end recorded at the press, no timed start pending,
 *                 the same after a restart. The press works over the socket too; a second
 *                 press is refused, concurrent presses (HTTP and socket) start one round.
 *                 The other host's account is deleted at the end.
 * Depends on:     ../src/auth/*, ./firstRound, ./harness, ./session, ./socketKit
 * Spec:           docs/spec/01-game-design.md §7 (D14, D21); docs/spec/05-api-design.md §2.3a;
 *                 docs/spec/06-realtime-architecture.md §4.1
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { createSession } from '../src/auth/sessions.js';
import { playFirstRound } from './firstRound.js';
import { buildOn, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import type { Client } from './session.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

let kit: SocketKit;
let harness: Harness;
let otherHostId = '';

beforeAll(async () => {
  kit = await startSocketKit();
  harness = kit.harness;
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  if (otherHostId !== '') await deleteAccount(harness.pool, otherHostId);
  await kit.close();
}, SUITE_TIMEOUT_MS);

// "Start next round now" as another organizer (match.manage, but not this match's host).
async function asOtherHost(code: string): Promise<number> {
  const other = await registerAccount(harness.pool, {
    email: 'pause-host@example.com',
    displayName: 'pausehost1',
    password: 'correct horse battery staple',
    roles: ['organizer'],
  });
  otherHostId = other.ok ? other.id : '';
  const s = await createSession(harness.pool, otherHostId, null);
  const r = await harness.built.fastify.inject({
    method: 'POST',
    url: `/api/v1/matches/${code}/next-round`,
    payload: {},
    headers: { cookie: `sbr_session=${s.token}`, 'x-csrf-token': s.csrfToken },
  });
  return r.statusCode;
}

interface StateBody {
  readonly view: { readonly events: readonly { type: string; roundIndex?: number }[] };
}

const startsOf = (body: StateBody, round: number) =>
  body.view.events.filter((e) => e.type === 'roundStarted' && e.roundIndex === round).length;

// A royale with a 60-second pause, the player joined and bots filled in, started; the host
// is refused while the first round runs, which is then played to its cut.
async function toFirstPause(host: Client, player: Client): Promise<{ code: string; id: string }> {
  const created = await host.post('/api/v1/matches', {
    title: 'Pause end',
    gameType: 'royale',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 8,
    roundPause: { kind: 'wait', ms: 60_000 },
    testProfile: 'fast',
  });
  const { code, id } = created.json<{ code: string; id: string }>();
  await player.post(`/api/v1/matches/${code}/join`, {});
  await host.post(`/api/v1/matches/${code}/bots`, { upTo: 8 });
  const engine = harness.built.match.engine;
  await engine.start(id, 0);
  await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
  const early = await host.post(`/api/v1/matches/${code}/next-round`, {});
  expect(early.json<{ code: string }>().code).toBe('NOT_WAITING_FOR_HOST');
  const me =
    (await engine.runner.current(id)).state.playerOrder.find((p) => !p.startsWith('bot-')) ?? '';
  await playFirstRound({ harness, id, code, player, me });
  expect((await engine.runner.current(id)).state.nextRoundAt).not.toBeNull();
  return { code, id };
}

// The event log ends with the pause end recorded at the press, then the round's start; no
// timed round start is left pending.
async function checkLog(id: string, pressedAt: number): Promise<void> {
  const pending = await harness.pool.query(
    `SELECT 1 FROM sbr.scheduled_actions
     WHERE match_id = $1 AND kind = 'start_round' AND done_at IS NULL`,
    [id],
  );
  expect(pending.rowCount).toBe(0);
  const log = await harness.pool.query<{ type: string; at: Date }>(
    `SELECT type, occurred_at AS at FROM sbr.match_events
     WHERE match_id = $1 ORDER BY seq DESC LIMIT 2`,
    [id],
  );
  expect(log.rows.map((r) => r.type)).toEqual(['roundStarted', 'nextRoundScheduled']);
  expect(log.rows[1]?.at.getTime()).toBeGreaterThanOrEqual(pressedAt - 1);
}

describe('the host ends a timed pause early (D21)', () => {
  it('starts the next round at once, once, also after a restart; only the host may', async () => {
    const { host, player } = kit;
    const { code, id } = await toFirstPause(host, player);
    const now = `/api/v1/matches/${code}/next-round`;
    expect((await player.post(now, {})).statusCode).toBe(403);
    expect(await asOtherHost(code)).toBe(403);
    const pressedAt = Date.now();
    expect((await host.post(now, {})).statusCode).toBe(200);

    const state = `/api/v1/matches/${code}/state`;
    for (const viewer of [player, host]) {
      const body = (await viewer.get(state)).json<StateBody>();
      expect(startsOf(body, 1)).toBe(1);
      expect(body.view.events.at(-1)?.type).toBe('roundStarted');
    }
    expect((await harness.built.match.engine.runner.current(id)).state.currentRound?.ended).toBe(
      false,
    );
    await checkLog(id, pressedAt);
    // A second server on the same database stands for a restart; the replaced timed
    // start, should it still run there, starts nothing.
    const restarted = await buildOn(harness.pool, harness.container.getConnectionUri());
    try {
      await restarted.match.engine.handle({ matchId: id, kind: 'start_round', dueAt: Date.now() });
      const again = await restarted.fastify.inject({ method: 'GET', url: state });
      expect(startsOf(again.json<StateBody>(), 1)).toBe(1);
      expect(startsOf(again.json<StateBody>(), 2)).toBe(0);
    } finally {
      await restarted.fastify.close();
    }
  }, 120_000);
});

describe('pressing "Start next round now" more than once (D21)', () => {
  const state = (code: string) => kit.host.get(`/api/v1/matches/${code}/state`);

  it('works over the socket, and a second press is refused on either path', async () => {
    const { code } = await toFirstPause(kit.host, kit.player);
    const socket = kit.open(kit.host.cookie);
    expect(await kit.connected(socket)).toBe('ok');
    expect(await kit.send(socket, 'round.next', { code })).toEqual({ ok: true });
    expect(await kit.send(socket, 'round.next', { code })).toMatchObject({
      ok: false,
      code: 'NOT_WAITING_FOR_HOST',
    });
    const http = await kit.host.post(`/api/v1/matches/${code}/next-round`, {});
    expect([http.statusCode, http.json()]).toEqual([409, { code: 'NOT_WAITING_FOR_HOST' }]);
    expect(startsOf((await state(code)).json<StateBody>(), 1)).toBe(1);
    socket.disconnect();
  }, 120_000);

  it('starts one round when HTTP and socket presses arrive together', async () => {
    const { code, id } = await toFirstPause(kit.host, kit.player);
    const socket = kit.open(kit.host.cookie);
    expect(await kit.connected(socket)).toBe('ok');
    const url = `/api/v1/matches/${code}/next-round`;
    const answers = await Promise.all([
      kit.host.post(url, {}).then((r) => r.statusCode === 200),
      kit.host.post(url, {}).then((r) => r.statusCode === 200),
      kit.send(socket, 'round.next', { code }).then((a) => a.ok),
      kit.send(socket, 'round.next', { code }).then((a) => a.ok),
    ]);
    expect(answers.filter(Boolean)).toHaveLength(1);
    expect(startsOf((await state(code)).json<StateBody>(), 1)).toBe(1);
    await checkLog(id, 0);
    socket.disconnect();
  }, 120_000);
});
