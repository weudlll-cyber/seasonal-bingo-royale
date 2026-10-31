/**
 * @file   packages/domain/src/match/roundEnd.properties.test.ts
 * @module domain/match
 * @brief  Property tests for the round end (12 §3 inv. 19) and late taps (inv. 17, in part).
 *
 * Responsibility: replay random classic and royale matches event by event and ask the
 *                 domain at every step: right after a draw, before its speed window has
 *                 closed, the round does not end (inv. 19, D10); once a round has ended,
 *                 no tap is accepted on any card (inv. 17, its last clause). The rest of
 *                 inv. 17 (bonus only inside the window, the auto-mark at the delay) and
 *                 inv. 18 depend on time and stay with the example tests.
 * Depends on:     fast-check, ../index, ../../test/arbitraries, ../../test/builders
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 17, 19
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createInitialMatchState,
  decide,
  evolve,
  simulateMatch,
  type DomainEvent,
  type MatchState,
} from '../index.js';
import { matchIdArb, seedArb } from '../../test/arbitraries.js';
import { classicRuleset, royaleRuleset } from '../../test/builders.js';

// Whole matches per case: a few cases with a small field keep the property under a second.
const RUNS = 8;

function simulated(gameType: 'classic' | 'royale', seed: Uint8Array, matchId: string) {
  return simulateMatch({
    matchId,
    seed,
    gameType,
    ruleset: gameType === 'royale' ? royaleRuleset() : classicRuleset(),
    playerCount: 4,
    tickedPrizes: gameType === 'royale' ? [] : ['rows-1', 'fullCard'],
    humans: { count: 2, drawIntervalMs: 6_000, speedWindowMs: 3_000 },
  }).events;
}

// Every tap the field could make on its first cards: none may be accepted.
function anyTapAccepted(state: MatchState): boolean {
  const round = state.currentRound;
  if (round === null) return false;
  return Object.entries(round.cards).some(([accountId, cards]) =>
    (cards[0]?.card.cells ?? []).some((_cell, cellIndex) => {
      const tap = {
        type: 'markCell' as const,
        accountId,
        cardIndex: 0,
        cellIndex,
        inSpeedWindow: true,
        speedBonus: 0,
      };
      return decide(state, tap, { now: 0 }).length > 0;
    }),
  );
}

function checkReplay(events: readonly DomainEvent[]): void {
  let state = createInitialMatchState();
  for (const event of events) {
    state = evolve(state, event);
    // Right after a draw its window is still open: the round cannot end (D10).
    if (event.type === 'drawMade') {
      expect(decide(state, { type: 'endRound' }, { now: 0 })).toEqual([]);
    }
    if (event.type === 'roundEnded') expect(anyTapAccepted(state)).toBe(false);
  }
}

describe('round end and late taps (inv. 17, 19)', () => {
  it.each(['classic', 'royale'] as const)(
    'a %s round never ends inside its last window and takes no tap after its end',
    (gameType) => {
      fc.assert(
        fc.property(seedArb, matchIdArb(), (seed, matchId) => {
          checkReplay(simulated(gameType, seed, matchId));
        }),
        { numRuns: RUNS },
      );
    },
  );
});
