/**
 * @file   packages/domain/src/match/match.properties.test.ts
 * @module domain/match
 * @brief  Property tests for the match lifecycle (12 §3 inv. 4, 12 — all paths).
 *
 * Responsibility: for randomised seeds and player counts, assert invariant 4 — every
 *                 player's score is the sum of their scoring events, and replay equals the
 *                 live result — and the classic-type invariant (12): every ticked prize is
 *                 awarded before the round ends, also when the pool runs out (then the
 *                 last draw completes every card).
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

// The points an event gives its player (01 §8): marks, season activations, patterns,
// Season Complete and the jackpot.
function eventPoints(e: DomainEvent): readonly [string, number] | null {
  switch (e.type) {
    case 'cellMarked':
      return [e.accountId, e.markPoints];
    case 'seasonActivated':
      return [e.accountId, e.instantPoints];
    case 'patternScored':
    case 'seasonCompleteFired':
      return [e.accountId, e.points];
    case 'jackpotClaimed':
      return [e.accountId, e.value];
    default:
      return null;
  }
}

function pointsFromEvents(events: readonly DomainEvent[]): Map<string, number> {
  const sum = new Map<string, number>();
  for (const e of events) {
    const p = eventPoints(e);
    if (p !== null) sum.set(p[0], (sum.get(p[0]) ?? 0) + p[1]);
  }
  return sum;
}

// Royale with every stage keeping its points, so the sum runs over the whole match.
function keepEverything() {
  const r = royaleRuleset();
  return { ...r, stages: r.stages.map((s) => ({ ...s, scoreCarry: { kind: 'keep' as const } })) };
}

// Full-match properties: under a busy parallel test run they can pass Vitest's 5 s
// default, so both blocks get an explicit budget (as in royale.properties.test.ts).
const FULL_MATCH_BUDGET = { timeout: 30_000 };

describe('match lifecycle invariant 4 (score = sum of scoring events)', FULL_MATCH_BUDGET, () => {
  it('gives every player exactly the points of their events', () => {
    fc.assert(
      fc.property(
        seedArb,
        matchIdArb(),
        playerCountArb,
        fc.constantFrom('royale', 'classic', 'classicSeasons'),
        (seed, matchId, count, gt) => {
          const r = simulateMatch({
            matchId,
            seed,
            gameType: gt,
            ruleset: gt === 'royale' ? keepEverything() : classicRuleset(),
            playerCount: Math.max(2, Math.min(count, 20)),
            tickedPrizes: gt === 'royale' ? [] : TICKED,
          });
          const sums = pointsFromEvents(r.events);
          for (const [id, p] of Object.entries(r.state.players)) {
            expect(p.points, id).toBe(sums.get(id) ?? 0);
          }
        },
      ),
      { numRuns: Math.min(numRuns, 50) },
    );
  });
});

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
  it('every ticked prize is awarded, also when the pool runs out', () => {
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
          // An exhausted pool has drawn every number, which completes every card.
          for (const key of TICKED) expect(awardedKeys.has(key), key).toBe(true);
        },
      ),
      { numRuns: Math.min(numRuns, 50) },
    );
  });
});
