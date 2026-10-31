/**
 * @file   packages/domain/test/arbitraries.ts
 * @module domain/test
 * @brief  Shared fast-check arbitraries for the property-based tests (12 §3).
 *
 * Responsibility: centralise the generators for seeds, player counts and the three
 *                 game types so every property file reuses the same bounds. Keeps each
 *                 property short and lets the owner tune the sampling in one place.
 * Depends on:     fast-check, @sbr/domain (types only), ../src/index
 * Used by:        the domain property tests (test helper)
 * Spec:           docs/spec/12-testing-strategy.md §3, §2
 */
import fc from 'fast-check';

import { SEED_BYTES, type GameType } from '../src/index.js';

export const seedArb: fc.Arbitrary<Uint8Array> = fc
  .uint8Array({ minLength: SEED_BYTES, maxLength: SEED_BYTES })
  .map((bytes) => new Uint8Array(bytes));

export const gameTypeArb: fc.Arbitrary<GameType> = fc.constantFrom<GameType>(
  'royale',
  'classicSeasons',
  'classic',
);

// Match sizes: the spec caps a match at 200 players (01 §7.6), but 1 player is a legal
// edge case for cards and scoring; we sample 1..200 for the full range.
export const playerCountArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 200 });

export const roundIndexArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 50 });

export function matchIdArb(): fc.Arbitrary<string> {
  // Short labels keep the DRBG label small and avoid heavy prettier formatting of
  // generated test cases on failure. The characters cover the usual public IDs.
  return fc.stringMatching(/^[a-z0-9]{1,16}$/).filter((s) => s.length > 0);
}

// A tiny account-id arbitrary. Keep it short to speed up the many-player properties.
export const accountIdArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z0-9]{1,8}$/)
  .filter((s) => s.length > 0);

// Local sampling budget. CI runs 1000 cases per property (12 §2); local runs 100 to
// keep the test suite under a minute. Override via the `FAST_CHECK_RUNS` env var.
export const numRuns = (() => {
  const env = process.env['FAST_CHECK_RUNS'];
  const parsed = env === undefined ? NaN : Number(env);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return process.env['CI'] === 'true' ? 1_000 : 100;
})();
