/**
 * @file   packages/domain/src/match/match.test.ts
 * @module domain/match
 * @brief  Full-match simulation tests for royale and both classic types (WP-07).
 *
 * Responsibility: drive the lifecycle end-to-end for 4, 20, 100 and 200 players in
 *                 royale and for 4, 20, 100 players in each classic type. Assert:
 *                 (i) replay = live (invariant 4); (ii) final placement is a total
 *                 order 1..N (invariant 8); (iii) every ticked prize is awarded in
 *                 classic rounds (invariant 12); (iv) the jackpot is claimed at most
 *                 once in royale (invariant 10); (v) seeds that decide fullCard early
 *                 and seeds that run to the last item of the pool, asserted.
 * Depends on:     ../index, ../../test/builders
 * Spec:           docs/spec/15-implementation-plan.md WP-07 Accept, 12 §3 inv. 4, 8, 10, 12
 */
import { describe, expect, it } from 'vitest';

import {
  createInitialMatchState,
  decide,
  evolve,
  simulateMatch,
  type DomainEvent,
} from '../index.js';
import { classicRuleset, royaleRuleset, seed } from '../../test/builders.js';

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'] as const;

function replay(events: readonly DomainEvent[]) {
  let state = createInitialMatchState();
  for (const ev of events) state = evolve(state, ev);
  return state;
}

// Full matches of up to 200 players: under a busy parallel test run they can pass
// Vitest's 5 s default, so these suites get an explicit budget (as the property tests).
const FULL_MATCH_BUDGET = { timeout: 30_000 };

describe('simulateMatch — royale', FULL_MATCH_BUDGET, () => {
  it.each([4, 20, 100, 200])('runs end to end with %i players and finishes', (count) => {
    const r = simulateMatch({
      matchId: `r-${String(count)}`,
      seed: seed((count % 7) + 1),
      gameType: 'royale',
      ruleset: royaleRuleset(),
      playerCount: count,
      tickedPrizes: [],
    });
    expect(r.state.phase).toBe('finished');
    const placement = r.state.finalPlacement;
    expect(placement).toHaveLength(count);
    expect(placement.map((p) => p.place).sort((a, b) => a - b)).toEqual(
      Array.from({ length: count }, (_v, i) => i + 1),
    );
    // Jackpot is claimed at most once (invariant 10).
    const jackpots = r.events.filter((e) => e.type === 'jackpotClaimed');
    expect(jackpots.length).toBeLessThanOrEqual(1);
    // Replay of the event log reproduces the live state (invariant 4).
    const replayed = replay(r.events);
    expect(replayed.finalPlacement).toEqual(r.state.finalPlacement);
    expect(replayed.phase).toBe('finished');
  });
});

describe('a match that has ended', () => {
  it('ignores an abort once finished or aborted (the 200-player check found one)', () => {
    const r = simulateMatch({
      matchId: 'r-end',
      seed: seed(2),
      gameType: 'royale',
      ruleset: royaleRuleset(),
      playerCount: 4,
      tickedPrizes: [],
    });
    const abort = { type: 'abortMatch', reason: 'late' } as const;
    expect(decide(r.state, abort, { now: 0 })).toEqual([]);
    const aborted = evolve(r.state, { type: 'matchAborted', reason: 'first' });
    expect(decide(aborted, abort, { now: 0 })).toEqual([]);
  });
});

describe('simulateMatch — classic, all ticked prizes', FULL_MATCH_BUDGET, () => {
  it.each<['classic' | 'classicSeasons', number]>([
    ['classic', 4],
    ['classic', 20],
    ['classic', 100],
    ['classicSeasons', 4],
    ['classicSeasons', 20],
    ['classicSeasons', 100],
  ])('awards every ticked prize for %s/%i', (gameType, count) => {
    const r = simulateMatch({
      matchId: `c-${gameType}-${String(count)}`,
      seed: seed(count),
      gameType,
      ruleset: classicRuleset(),
      playerCount: count,
      tickedPrizes: [...TICKED],
    });
    const awardedKeys = new Set(
      r.events.flatMap((e) => (e.type === 'classicPrizeAwarded' ? [e.prizeKey] : [])),
    );
    for (const key of TICKED) expect(awardedKeys.has(key)).toBe(true);
    expect(r.state.phase).toBe('finished');
    expect(r.state.finalPlacement).toHaveLength(count);
    // Replay = live.
    expect(replay(r.events).finalPlacement).toEqual(r.state.finalPlacement);
  });
});

// Seeds found by search (RUN-4): with 100 players, fullCard usually falls in the mid 60s;
// these decide it early. With 4 players and only fullCard, these run to the last item.
describe(
  'simulateMatch — classic seeds: early fullCard and the end of the pool',
  FULL_MATCH_BUDGET,
  () => {
    it.each<['classic' | 'classicSeasons', number, number]>([
      ['classic', 51, 54],
      ['classicSeasons', 205, 57],
    ])('%s seed %i decides fullCard early, on draw %i', (gameType, byte, draw) => {
      const r = simulateMatch({
        matchId: `fc-${gameType}`,
        seed: seed(byte),
        gameType,
        ruleset: classicRuleset(),
        playerCount: 100,
        tickedPrizes: [...TICKED],
      });
      const fullCard = r.events.find(
        (e) => e.type === 'classicPrizeAwarded' && e.prizeKey === 'fullCard',
      );
      expect(fullCard?.type === 'classicPrizeAwarded' ? fullCard.drawIndex + 1 : null).toBe(draw);
    });

    it.each<['classic' | 'classicSeasons', number, number]>([
      ['classic', 75, 75],
      ['classicSeasons', 22, 79],
    ])('%s seed %i runs fullCard-only to the last of %i items', (gameType, byte, poolSize) => {
      const r = simulateMatch({
        matchId: `end-${gameType}`,
        seed: seed(byte),
        gameType,
        ruleset: classicRuleset(),
        playerCount: 4,
        tickedPrizes: ['fullCard'],
      });
      expect(r.events.filter((e) => e.type === 'drawMade')).toHaveLength(poolSize);
      const fullCard = r.events.find((e) => e.type === 'classicPrizeAwarded');
      expect(fullCard?.type === 'classicPrizeAwarded' ? fullCard.drawIndex + 1 : null).toBe(
        poolSize,
      );
    });
  },
);

describe('replay = live for the royale lifecycle', () => {
  it('a 20-player royale replay matches the live state in every public field', () => {
    const r = simulateMatch({
      matchId: 'r-replay',
      seed: seed(3),
      gameType: 'royale',
      ruleset: royaleRuleset(),
      playerCount: 20,
      tickedPrizes: [],
    });
    const replayed = replay(r.events);
    expect(replayed.phase).toBe(r.state.phase);
    expect(replayed.stageIndex).toBe(r.state.stageIndex);
    expect(replayed.roundIndex).toBe(r.state.roundIndex);
    expect(replayed.jackpot.claimedBy).toBe(r.state.jackpot.claimedBy);
    expect(replayed.finalPlacement).toEqual(r.state.finalPlacement);
    // Every player's points match.
    for (const id of r.state.playerOrder) {
      expect(replayed.players[id]?.points).toBe(r.state.players[id]?.points);
    }
  });
});
