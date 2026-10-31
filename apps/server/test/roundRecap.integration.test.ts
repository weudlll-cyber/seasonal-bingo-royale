/**
 * @file   apps/server/test/roundRecap.integration.test.ts
 * @module server/test
 * @brief  The royale round recap in the pause (D20): the same for every viewer and after a restart.
 *
 * Responsibility: a royale (fast test profile, 60-second pause), a player tapping their
 *                 own numbers over the HTTP fallback, bots filling the field, round 1 played
 *                 to the cut: one recap in the pause, the same for player, host, a viewer
 *                 without a session and after a restart, with the draws, the cut and (five
 *                 own taps) the player as fastest tapper; none before the round ends. A
 *                 bots-only royale with a fixed seed and match id gives exactly known values.
 * Depends on:     fastify (types), @sbr/contracts (types), @sbr/domain, ../src/dev/fastRulesets,
 *                 ./firstRound, ./harness, ./session
 * Spec:           docs/spec/01-game-design.md §7 (D20); docs/spec/05-api-design.md §2.3a
 */
import type { RoundRecap } from '@sbr/contracts';
import { SEED_BYTES } from '@sbr/domain';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { fastRuleset } from '../src/dev/fastRulesets.js';
import { playFirstRound } from './firstRound.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn } from './session.js';

let harness: Harness;
// While set, the match seed is fixed (every byte 7); everything else stays random.
let fixedSeed = false;

vi.mock('node:crypto', async (original) => {
  const real = await original<typeof import('node:crypto')>();
  const randomBytes = (size: number) =>
    fixedSeed && size === SEED_BYTES ? Buffer.alloc(size, 7) : real.randomBytes(size);
  return { ...real, default: { ...real, randomBytes }, randomBytes };
});

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

describe('round recap for a fixed seed (D20)', () => {
  it('has exactly the values the seed gives', async () => {
    const engine = harness.built.match.engine;
    // Bots only: their ids are fixed, so with seed and match id the round is too.
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce(
      '00000000-0000-4000-8000-0000000000d2',
    );
    fixedSeed = true;
    const created = await engine
      .create(
        {
          title: 'Fixed recap',
          gameType: 'royale',
          drawMode: 'host',
          missedNumbers: { kind: 'noAutoMark' },
          maxPlayers: 8,
          roundPause: { kind: 'wait', ms: 60_000 },
          ruleset: fastRuleset('royale') ?? undefined,
        },
        null,
      )
      .finally(() => {
        fixedSeed = false;
      });
    const { id, code } = created;
    await engine.fillWithBots(id, 8);
    await engine.start(id, 0);
    await engine.handle({ matchId: id, kind: 'start_match', dueAt: Date.now() });
    const host = await signIn(harness.built.fastify, 'host');
    await playFirstRound({ harness, id, code, player: host, me: '' });
    const recaps = await recapsOf(() => host.get(`/api/v1/matches/${code}/state`));
    // 8 bots, a 50 % cut keeps 4 (D18) and bot-01's Winter shield saves one more; bot-07
    // ranks above bot-06 on equal points by the 01 §8.4 chain, though bot-06 joined first.
    expect(recaps).toEqual([
      {
        roundIndex: 0,
        top: [
          { name: 'bot-03', points: 65 },
          { name: 'bot-07', points: 50 },
          { name: 'bot-06', points: 50 },
        ],
        climber: { name: 'bot-07', from: 7, to: 2 },
        cut: { outCount: 3, out: ['bot-08', 'bot-02', 'bot-05'], saved: ['bot-01'] },
        facts: { numbersDrawn: 12, playersLeft: 5 },
      },
    ]);
  }, 120_000);
});
