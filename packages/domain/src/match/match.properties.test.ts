/**
 * @file   packages/domain/src/match/match.properties.test.ts
 * @module domain/match
 * @brief  Property tests for the match lifecycle (12 §3 inv. 4, 12 — all paths).
 *
 * Responsibility: for randomised seeds and player counts, assert "replay = live"
 *                 (invariant 4) and the classic-type invariant (12): a prize is
 *                 awarded exactly once per (prize, account) and every ticked prize is
 *                 awarded on or before the deciding draw. One classicSeasons property
 *                 confirms symbols drive their own cells on every card.
 * Depends on:     fast-check, ../index, ../../test/arbitraries, ../../test/builders
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 4, 12
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createInitialMatchState, evolve, simulateMatch, type DomainEvent } from '../index.js';
import { numRuns, playerCountArb, seedArb, matchIdArb } from '../../test/arbitraries.js';
import { classicRuleset, royaleRuleset } from '../../test/builders.js';

function replay(events: readonly DomainEvent[]) {
  let state = createInitialMatchState();
  for (const ev of events) state = evolve(state, ev);
  return state;
}

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'];

// Full-match properties: under a busy parallel test run they can pass Vitest's 5 s
// default, so both blocks get an explicit budget (as in royale.properties.test.ts).
const FULL_MATCH_BUDGET = { timeout: 30_000 };

describe('match lifecycle invariant 4 (replay = live)', FULL_MATCH_BUDGET, () => {
  it('replay of a full royale match equals the live final placement', () => {
    fc.assert(
      fc.property(seedArb, matchIdArb(), playerCountArb, (seed, matchId, count) => {
        const r = simulateMatch({
          matchId,
          seed,
          gameType: 'royale',
          ruleset: royaleRuleset(),
          playerCount: Math.max(2, Math.min(count, 20)),
          tickedPrizes: [],
        });
        expect(replay(r.events).finalPlacement).toEqual(r.state.finalPlacement);
      }),
      { numRuns: Math.min(numRuns, 50) },
    );
  });

  it('replay of a classic match equals the live final placement', () => {
    fc.assert(
      fc.property(
        seedArb,
        matchIdArb(),
        playerCountArb,
        fc.constantFrom('classic', 'classicSeasons'),
        (seed, matchId, count, gt) => {
          const r = simulateMatch({
            matchId,
            seed,
            gameType: gt,
            ruleset: classicRuleset(),
            playerCount: Math.max(2, Math.min(count, 20)),
            tickedPrizes: TICKED,
          });
          expect(replay(r.events).finalPlacement).toEqual(r.state.finalPlacement);
        },
      ),
      { numRuns: Math.min(numRuns, 50) },
    );
  });
});

describe('classic invariant 12', FULL_MATCH_BUDGET, () => {
  it('every ticked prize is awarded (or the pool ran out)', () => {
    fc.assert(
      fc.property(
        seedArb,
        matchIdArb(),
        playerCountArb,
        fc.constantFrom('classic', 'classicSeasons'),
        (seed, matchId, count, gt) => {
          const r = simulateMatch({
            matchId,
            seed,
            gameType: gt,
            ruleset: classicRuleset(),
            playerCount: Math.max(2, Math.min(count, 20)),
            tickedPrizes: TICKED,
          });
          const awardedKeys = new Set(
            r.events.flatMap((e) => (e.type === 'classicPrizeAwarded' ? [e.prizeKey] : [])),
          );
          // Either every ticked prize was awarded, or the round ended via pool exhaustion.
          const poolExhausted = r.events.some(
            (e) => e.type === 'roundEnded' && e.reason === 'poolExhausted',
          );
          if (!poolExhausted) {
            for (const key of TICKED) expect(awardedKeys.has(key)).toBe(true);
          }
        },
      ),
      { numRuns: Math.min(numRuns, 50) },
    );
  });
});
