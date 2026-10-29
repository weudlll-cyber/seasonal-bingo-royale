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
 * Depends on:     vitest, fastify (types), @sbr/contracts (types), ./firstRound, ./harness,
 *                 ./session
 * Spec:           docs/spec/01-game-design.md §7 (D20); docs/spec/05-api-design.md §2.3a
 */
import type { RoundRecap } from '@sbr/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { playFirstRound } from './firstRound.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn } from './session.js';

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
    const taps = await playFirstRound({ harness, id, code, player, me });

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
