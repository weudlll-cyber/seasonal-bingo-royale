/**
 * @file   packages/domain/src/draw/draw.test.ts
 * @module domain/draw
 * @brief  Tests for DRBG determinism and the draw sequence invariants (12 §3).
 *
 * Responsibility: lock in invariants 2, 3, 14 of 12 §3 — deterministic DRBG and
 *                 draw order, permutation prefix of 1–75 for royale/classic, and
 *                 permutation of 79 items (75 + 4 symbols) for classicSeasons.
 * Depends on:     ../index (./drbg and ./drawSequence through it)
 * Spec:           docs/spec/12-testing-strategy.md §3
 */
import { describe, expect, it } from 'vitest';

import { createDrbg, drawSequence, SEED_BYTES } from '../index.js';

const seed = (byte: number): Uint8Array => new Uint8Array(SEED_BYTES).fill(byte);

describe('DRBG', () => {
  it('same seed and label produce the same stream', () => {
    const a = createDrbg(seed(1), 'label');
    const b = createDrbg(seed(1), 'label');
    const seqA = Array.from({ length: 64 }, () => a.nextUint32());
    const seqB = Array.from({ length: 64 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('different labels produce independent streams', () => {
    const a = createDrbg(seed(1), 'label-a');
    const b = createDrbg(seed(1), 'label-b');
    expect(a.nextUint32()).not.toBe(b.nextUint32());
  });

  it('nextInt is uniform over its range for a large sample', () => {
    const drbg = createDrbg(seed(7), 'uniform');
    const buckets = Array<number>(10).fill(0);
    for (let i = 0; i < 10_000; i += 1) {
      const bucketIndex = drbg.nextInt(10);
      const count = buckets[bucketIndex];
      if (count === undefined) throw new Error('bucket out of range');
      buckets[bucketIndex] = count + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1_200);
    }
  });

  it('rejects a seed of the wrong length', () => {
    expect(() => createDrbg(new Uint8Array(16), 'label')).toThrow();
  });
});

describe('drawSequence', () => {
  const base = { seed: seed(5), matchId: 'M1', roundIndex: 0 } as const;

  it('royale pool is a permutation of 1..75', () => {
    const items = drawSequence({ ...base, gameType: 'royale' });
    expect(items).toHaveLength(75);
    expect(new Set(items)).toEqual(new Set(Array.from({ length: 75 }, (_v, i) => i + 1)));
  });

  it('classicSeasons pool permutes 75 numbers plus 4 symbols', () => {
    const items = drawSequence({ ...base, gameType: 'classicSeasons' });
    expect(items).toHaveLength(79);
    const numbers = items.filter((i) => i >= 1 && i <= 75);
    const symbols = items.filter((i) => i >= 101 && i <= 104);
    expect(new Set(numbers).size).toBe(75);
    expect(new Set(symbols)).toEqual(new Set([101, 102, 103, 104]));
  });

  it('is deterministic across runs for the same (seed, match, round)', () => {
    const a = drawSequence({ ...base, gameType: 'royale' });
    const b = drawSequence({ ...base, gameType: 'royale' });
    expect(a).toEqual(b);
  });

  it('a different round index produces a different order', () => {
    const a = drawSequence({ ...base, gameType: 'royale' });
    const b = drawSequence({ ...base, roundIndex: 1, gameType: 'royale' });
    expect(a).not.toEqual(b);
  });
});
