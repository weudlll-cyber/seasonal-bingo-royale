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
 *                 once in royale (invariant 10); (v) a seed that forces an early
 *                 fullCard still ends the round correctly in classic.
 * Depends on:     ../index, ../../test/builders
 * Spec:           docs/spec/15-implementation-plan.md WP-07 Accept, 12 §3 inv. 4, 8, 10, 12
 */
import { describe, expect, it } from 'vitest';

import { createInitialMatchState, evolve, simulateMatch, type DomainEvent } from '../index.js';
import { classicRuleset, royaleRuleset, seed } from '../../test/builders.js';

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'] as const;

function replay(events: readonly DomainEvent[]) {
  let state = createInitialMatchState();
  for (const ev of events) state = evolve(state, ev);
  return state;
}

describe('simulateMatch — royale', () => {
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

describe('simulateMatch — classic (early fullCard seed)', () => {
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

describe('simulateMatch — classic (fullCard-only runs close to the pool end)', () => {
  it.each<['classic' | 'classicSeasons']>([['classic'], ['classicSeasons']])(
    'drives %s to the full-house end of the pool',
    (gameType) => {
      const r = simulateMatch({
        matchId: `c-${gameType}-fullcard`,
        seed: seed(42),
        gameType,
        ruleset: classicRuleset(),
        playerCount: 4,
        tickedPrizes: ['fullCard'],
      });
      // The deciding draw is the one that awards fullCard; some players may land it
      // on the same draw, but at least one classicPrizeAwarded for fullCard must exist.
      const fullCardAwards = r.events.filter(
        (e) => e.type === 'classicPrizeAwarded' && e.prizeKey === 'fullCard',
      );
      expect(fullCardAwards.length).toBeGreaterThanOrEqual(1);
      expect(r.state.phase).toBe('finished');
    },
  );
});

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
