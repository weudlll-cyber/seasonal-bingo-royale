/**
 * @file   packages/domain/src/commitment.test.ts
 * @module domain
 * @brief  Seed commitment tests — invariant 11 of 12 §3.
 *
 * Responsibility: show that commitSeed matches the openssl `sha256(seed)` fixture
 *                 vector and that verifyCommitment is `true` for a matching pair and
 *                 `false` for every mismatch (wrong length, flipped byte).
 * Depends on:     ./index
 * Spec:           docs/spec/12-testing-strategy.md §3 invariant 11
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { commitSeed, SEED_BYTES, verifyCommitment } from './index.js';

describe('seed commitment', () => {
  const seed = new Uint8Array(SEED_BYTES).map((_v, i) => i);

  it('matches sha256(seed)', () => {
    const expected = new Uint8Array(createHash('sha256').update(seed).digest());
    expect(commitSeed(seed)).toEqual(expected);
  });

  it('verifyCommitment is true for a matching pair', () => {
    expect(verifyCommitment(seed, commitSeed(seed))).toBe(true);
  });

  it('verifyCommitment is false when a byte is flipped', () => {
    const commitment = commitSeed(seed);
    const flipped = new Uint8Array(commitment);
    const first = flipped[0];
    if (first === undefined) throw new Error('empty commitment');
    flipped[0] = first ^ 0xff;
    expect(verifyCommitment(seed, flipped)).toBe(false);
  });

  it('verifyCommitment is false when the commitment is the wrong length', () => {
    expect(verifyCommitment(seed, new Uint8Array(16))).toBe(false);
  });
});
