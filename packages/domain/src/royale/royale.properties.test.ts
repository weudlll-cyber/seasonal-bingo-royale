/**
 * @file   packages/domain/src/royale/royale.properties.test.ts
 * @module domain/royale
 * @brief  Property tests for cuts and final ranking (12 §3 inv. 5, 7, 8).
 *
 * Responsibility: cuts never fall below `minSurvivors`, shield saves only add, no
 *                 eliminated player ever ranks above a survivor (invariant 7).
 *                 finalRanking is a total order 1..N over all entrants (invariant 8).
 *                 A pattern scores at most once per card per round (invariant 5): we
 *                 drive a classic round and look for duplicate (round, prize, account).
 * Depends on:     fast-check, ../index, ../../test/arbitraries
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 5, 7, 8
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  applyCut,
  finalRanking,
  simulateMatch,
  type Candidate,
  type RankedPlayer,
} from '../index.js';
import { numRuns, playerCountArb, seedArb, matchIdArb } from '../../test/arbitraries.js';
import { classicRuleset, royaleRuleset } from '../../test/builders.js';

const candidateArb: fc.Arbitrary<Candidate> = fc.record({
  accountId: fc.stringMatching(/^[a-z0-9]{1,8}$/).filter((s) => s.length > 0),
  points: fc.integer({ min: 0, max: 100_000 }),
  patterns: fc.integer({ min: 0, max: 20 }),
  seasonsActivated: fc.integer({ min: 0, max: 4 }),
  lastScoringDraw: fc.option(fc.integer({ min: 0, max: 74 }), { nil: null }),
  joinedAt: fc.integer({ min: 0, max: 1000 }),
  shieldCharges: fc.integer({ min: 0, max: 3 }),
  shieldRankMargin: fc.integer({ min: 0, max: 5 }),
});

// The ranking of 01 §8.4: points, patterns, seasons activated, earlier last scoring draw
// (never scored = last), earlier join. Written from the spec, independent of cut.ts.
function byTieBreakChain(a: Candidate, b: Candidate): number {
  const lastA = a.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  const lastB = b.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  return (
    b.points - a.points ||
    b.patterns - a.patterns ||
    b.seasonsActivated - a.seasonsActivated ||
    (lastA === lastB ? 0 : lastA - lastB) ||
    a.joinedAt - b.joinedAt
  );
}

function uniqueCandidates(min = 2, max = 50): fc.Arbitrary<readonly Candidate[]> {
  return fc
    .uniqueArray(candidateArb, { minLength: min, maxLength: max, selector: (c) => c.accountId })
    .map((list) => list);
}

describe('cut invariant 7', () => {
  it('survivors never below minSurvivors; shield saves only add', () => {
    fc.assert(
      fc.property(
        uniqueCandidates(2, 30),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 1, max: 100 }),
        (candidates, minSurvivors, keepPercent) => {
          const rule = { keep: 'percent' as const, value: keepPercent, minSurvivors };
          const result = applyCut(candidates, rule);
          const total = new Set(candidates.map((c) => c.accountId)).size;
          expect(result.survivors.length).toBeGreaterThanOrEqual(Math.min(minSurvivors, total));
          // Shield saves are a subset of survivors.
          for (const id of result.shieldSaves) expect(result.survivors).toContain(id);
          // Survivors + eliminated = total.
          expect(result.survivors.length + result.eliminated.length).toBe(total);
        },
      ),
      { numRuns },
    );
  });

  it('no eliminated player is ranked above a non-shielded survivor', () => {
    fc.assert(
      fc.property(
        uniqueCandidates(3, 30),
        fc.integer({ min: 1, max: 30 }),
        (candidates, keepCount) => {
          const rule = { keep: 'count' as const, value: keepCount, minSurvivors: 2 };
          const result = applyCut(candidates, rule);
          const ranked = [...candidates].sort(byTieBreakChain);
          const nonShieldSurvivors = result.survivors.filter(
            (id) => !result.shieldSaves.includes(id),
          );
          for (const eId of result.eliminated) {
            const eRank = ranked.findIndex((c) => c.accountId === eId);
            for (const sId of nonShieldSurvivors) {
              const sRank = ranked.findIndex((c) => c.accountId === sId);
              expect(eRank).toBeGreaterThan(sRank);
            }
          }
        },
      ),
      { numRuns },
    );
  });
});

describe('cut invariant 7 — fixed regression', () => {
  // fast-check counterexample of 2026-10-20: tied points, where only the last-scoring-draw
  // tie-break separates the players. The test's old points-and-join ranking disagreed
  // with 01 §8.4; the cut itself was right.
  it('keeps the tied player who scored (draw 0) above the one who never scored', () => {
    const base = { patterns: 0, seasonsActivated: 0, joinedAt: 0, shieldCharges: 0 };
    const player = (accountId: string, points: number, lastScoringDraw: number | null) => ({
      ...base,
      accountId,
      points,
      lastScoringDraw,
      shieldRankMargin: 0,
    });
    const result = applyCut(
      [
        player('0', 99_988, 0),
        player('1', 99_988, null),
        player('2', 99_988, 0),
        player('a', 0, null),
      ],
      { keep: 'count', value: 1, minSurvivors: 2 },
    );
    expect(result.survivors).toEqual(['0', '2']);
    expect(result.eliminated).toEqual(['1', 'a']);
  });
});

describe('finalRanking invariant 8', () => {
  it('produces a total order 1..N for every input', () => {
    const rankedArb: fc.Arbitrary<readonly RankedPlayer[]> = fc.uniqueArray(
      fc.record({
        accountId: fc.stringMatching(/^[a-z0-9]{1,8}$/).filter((s) => s.length > 0),
        joinedAt: fc.integer({ min: 0, max: 1000 }),
        points: fc.integer({ min: 0, max: 10_000 }),
        patterns: fc.integer({ min: 0, max: 20 }),
        seasonsActivated: fc.integer({ min: 0, max: 4 }),
        lastScoringDraw: fc.option(fc.integer({ min: 0, max: 74 }), { nil: null }),
        eliminatedAtRound: fc.option(fc.integer({ min: 0, max: 10 }), { nil: null }),
      }),
      { minLength: 1, maxLength: 50, selector: (p) => p.accountId },
    );
    fc.assert(
      fc.property(rankedArb, (players) => {
        const placement = finalRanking(players);
        expect(placement).toHaveLength(players.length);
        expect(placement.map((p) => p.place).sort((a, b) => a - b)).toEqual(
          Array.from({ length: players.length }, (_v, i) => i + 1),
        );
        // Every account id appears exactly once.
        expect(new Set(placement.map((p) => p.accountId)).size).toBe(players.length);
      }),
      { numRuns },
    );
  });
});

// Each property simulates up to 50 full matches; under a busy parallel test run that
// can pass Vitest's 5 s default, so this block gets an explicit budget.
describe('simulated-match invariants (5, 10, 12)', { timeout: 30_000 }, () => {
  it('invariant 10: royale jackpot claimed at most once', () => {
    fc.assert(
      fc.property(seedArb, matchIdArb(), playerCountArb, (seed, matchId, count) => {
        const r = simulateMatch({
          matchId,
          seed,
          gameType: 'royale',
          ruleset: royaleRuleset(),
          playerCount: Math.max(2, Math.min(count, 30)),
          tickedPrizes: [],
        });
        const jackpots = r.events.filter((e) => e.type === 'jackpotClaimed');
        expect(jackpots.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: Math.min(numRuns, 50) },
    );
  });

  it('invariant 12: classic awards a prize at most once per (prize, account)', () => {
    fc.assert(
      fc.property(seedArb, matchIdArb(), playerCountArb, (seed, matchId, count) => {
        const r = simulateMatch({
          matchId,
          seed,
          gameType: 'classic',
          ruleset: classicRuleset(),
          playerCount: Math.max(2, Math.min(count, 20)),
          tickedPrizes: ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'],
        });
        const seen = new Set<string>();
        for (const ev of r.events) {
          if (ev.type !== 'classicPrizeAwarded') continue;
          const key = `${ev.prizeKey}:${ev.accountId}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }),
      { numRuns: Math.min(numRuns, 50) },
    );
  });

  it('invariant 5: patternScored events are unique per (round, card, prize) in royale', () => {
    fc.assert(fc.property(seedArb, matchIdArb(), playerCountArb, checkPatternsUnique), {
      numRuns: Math.min(numRuns, 50),
    });
  });
});

function checkPatternsUnique(seed: Uint8Array, matchId: string, count: number): void {
  const r = simulateMatch({
    matchId,
    seed,
    gameType: 'royale',
    ruleset: royaleRuleset(),
    playerCount: Math.max(2, Math.min(count, 20)),
    tickedPrizes: [],
  });
  const seen = new Set<string>();
  let currentRound = -1;
  for (const ev of r.events) {
    if (ev.type === 'roundStarted') {
      currentRound = ev.roundIndex;
      continue;
    }
    if (ev.type !== 'patternScored') continue;
    const key = `${String(currentRound)}:${ev.accountId}:${String(ev.cardIndex)}:${ev.prizeKey}`;
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
}
