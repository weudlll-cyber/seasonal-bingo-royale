/**
 * @file   apps/server/test/roundRecap.integration.test.ts
 * @module server/test
 * @brief  The royale round recap in the pause (D20): the same for every viewer and after a restart.
 *
 * Responsibility: a royale with the fast test profile and a 60-second pause: a player taps
 *                 their own numbers as they come (over the HTTP fallback), bots fill the
 *                 field, the first round is played to its end (12 draws, then the cut). In the
 *                 pause the state carries one recap for the round: the same for the player,
 *                 the host and a viewer without a session, with the numbers drawn, the cut
 *                 and, with at least five own taps, the player as the fastest tapper (bots
 *                 never count). Before the round ends there is none. A second server on the
 *                 same database (a restart in the pause) gives the same recap.
 * Depends on:     vitest, fastify (types), @sbr/contracts (types), ./harness, ./session
 * Spec:           docs/spec/01-game-design.md §7 (D20); docs/spec/05-api-design.md §2.3a
 */
import type { RoundRecap } from '@sbr/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

interface StateBody {
  readonly view: { readonly recaps?: readonly RoundRecap[] };
}

const recapsOf = async (get: () => Promise<LightMyRequestResponse>) =>
  (await get()).json<StateBody>().view.recaps;

// The player taps the number just drawn, if it is on their card; true when it marked.
async function tapNewest(id: string, code: string, player: Client, me: string) {
  const now = (await harness.built.match.engine.runner.current(id)).state.currentRound;
  const item = now?.draws.at(-1);
  const cell =
    now?.cards[me]?.[0]?.card.cells.findIndex((c) => c.kind === 'number' && c.value === item) ?? -1;
  if (cell < 0) return false;
  const r = await player.post(`/api/v1/matches/${code}/marks`, { cardIndex: 0, cell });
  return r.statusCode < 300;
}

// Plays the first round to its end: after every draw the player taps their own new number,
// then the draw's speed window closes. Returns how many taps the player made.
async function playFirstRound(id: string, code: string, player: Client, me: string) {
  const engine = harness.built.match.engine;
  let taps = 0;
  for (let i = 0; i < 40; i += 1) {
    const round = (await engine.runner.current(id)).state.currentRound;
    if (round === null || round.ended) return taps;
    await engine.handle({ matchId: id, kind: 'draw', dueAt: Date.now() });
    if (await tapNewest(id, code, player, me)) taps += 1;
    const drawIndex = ((await engine.runner.current(id)).state.currentRound?.draws.length ?? 0) - 1;
    await engine.handle({ matchId: id, kind: 'close_speed_window', dueAt: Date.now(), drawIndex });
  }
  return taps;
}

describe('round recap in the pause (D20)', () => {
  it('is the same for every viewer and after a restart', async () => {
    const host = await signIn(harness.built.fastify, 'host');
    const player = await signIn(harness.built.fastify, 'player-1');
    const created = await host.post('/api/v1/matches', {
      title: 'Recap',
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
    const state = `/api/v1/matches/${code}/state`;
    expect(await recapsOf(() => player.get(state))).toBeUndefined();
    const me =
      (await engine.runner.current(id)).state.playerOrder.find((p) => !p.startsWith('bot-')) ?? '';
    const taps = await playFirstRound(id, code, player, me);

    const recaps = await recapsOf(() => player.get(state));
    expect(recaps).toHaveLength(1);
    const recap = recaps?.[0];
    expect(recap?.roundIndex).toBe(0);
    expect(recap?.facts.numbersDrawn).toBe(12);
    expect(recap?.cut?.outCount).toBeGreaterThan(0);
    if (taps >= 5) expect(recap?.fastest?.name).toBe('dev-player-1');
    else expect(recap?.fastest).toBeUndefined();
    expect(await recapsOf(() => host.get(state))).toEqual(recaps);
    const anonymous = () => harness.built.fastify.inject({ method: 'GET', url: state });
    expect(await recapsOf(anonymous)).toEqual(recaps);
    // A second server on the same database stands for a restart in the pause.
    const restarted = await buildOn(harness.pool, harness.container.getConnectionUri());
    try {
      const again = () => restarted.fastify.inject({ method: 'GET', url: state });
      expect(await recapsOf(again)).toEqual(recaps);
    } finally {
      await restarted.fastify.close();
    }
  }, 120_000);
});
