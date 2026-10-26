/**
 * @file   packages/domain/src/draw/draw.properties.test.ts
 * @module domain/draw
 * @brief  Property tests for the draw sequence and commitment (12 §3 inv. 3, 11, 14).
 *
 * Responsibility: fast-check that the draw sequence is a permutation prefix of the
 *                 game-type pool with no repeats (invariant 3), that `commitSeed`
 *                 round-trips with `verifyCommitment` (invariant 11), and that the
 *                 sequence length matches the pool size per game type (invariant 14).
 * Depends on:     fast-check, ../index, ../../test/arbitraries
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 3, 11, 14
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  commitSeed,
  drawSequence,
  NUMBER_MAX,
  NUMBER_MIN,
  poolItems,
  poolSize,
  SYMBOL_IDS,
  verifyCommitment,
} from '../index.js';
import {
  gameTypeArb,
  matchIdArb,
  numRuns,
  roundIndexArb,
  seedArb,
} from '../../test/arbitraries.js';

// 1 000 cases in CI: alone a few seconds, beside the coverage run and the integration
// databases more than Vitest's 5 s default (it timed out twice under load); an explicit
// budget, as the full-match properties have.
describe('draw and commitment invariants', { timeout: 30_000 }, () => {
  it('invariant 3 + 14: sequence is a permutation of the pool with no repeats', () => {
    fc.assert(
      fc.property(
        seedArb,
        matchIdArb(),
        roundIndexArb,
        gameTypeArb,
        (seed, matchId, roundIndex, gameType) => {
          const sequence = drawSequence({ seed, matchId, roundIndex, gameType });
          expect(sequence).toHaveLength(poolSize(gameType));
          // No repeats.
          expect(new Set(sequence).size).toBe(sequence.length);
          // Every element belongs to the pool.
          const pool = new Set(poolItems(gameType));
          for (const item of sequence) expect(pool.has(item)).toBe(true);
          // Every pool item appears.
          for (const item of pool) expect(sequence).toContain(item);
        },
      ),
      { numRuns },
    );
  });

  it('invariant 14: royale and classic use only the 75 numbers', () => {
    fc.assert(
      fc.property(seedArb, matchIdArb(), roundIndexArb, (seed, matchId, roundIndex) => {
        for (const gameType of ['royale', 'classic'] as const) {
          const sequence = drawSequence({ seed, matchId, roundIndex, gameType });
          for (const item of sequence) {
            expect(item).toBeGreaterThanOrEqual(NUMBER_MIN);
            expect(item).toBeLessThanOrEqual(NUMBER_MAX);
          }
        }
      }),
      { numRuns },
    );
  });

  it('invariant 14: classicSeasons draws the 75 numbers + 4 symbols', () => {
    fc.assert(
      fc.property(seedArb, matchIdArb(), roundIndexArb, (seed, matchId, roundIndex) => {
        const sequence = drawSequence({ seed, matchId, roundIndex, gameType: 'classicSeasons' });
        expect(sequence).toHaveLength(NUMBER_MAX + SYMBOL_IDS.length);
        for (const symbol of SYMBOL_IDS) expect(sequence).toContain(symbol);
      }),
      { numRuns },
    );
  });

  it('invariant 11: sha256(seed) is the published commitment and verifyCommitment confirms it', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const commitment = commitSeed(seed);
        expect(verifyCommitment(seed, commitment)).toBe(true);
      }),
      { numRuns },
    );
  });
});
