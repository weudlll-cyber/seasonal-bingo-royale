/**
 * @file   apps/server/src/match/codec.test.ts
 * @module server/match
 * @brief  Seed encryption round trip: what encryptSeed seals, decryptSeed opens.
 *
 * Responsibility: the stored seed (04 §3.3 `seed_enc`) comes back byte for byte with the
 *                 right key, a fresh IV makes two seals differ, and a wrong key or a
 *                 changed byte fails instead of returning another seed (GCM tag). The
 *                 seed reveal after a match (WP-10 remainder) reads it this way.
 * Depends on:     vitest, node:crypto, ./codec
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/03-security-architecture.md §9
 */
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decryptSeed, encryptSeed } from './codec.js';

describe('seed encryption', () => {
  const key = randomBytes(32);
  const seed = new Uint8Array(randomBytes(32));

  it('opens what it sealed, with a fresh IV every time', () => {
    const sealed = encryptSeed(seed, key);
    expect(decryptSeed(sealed, key)).toEqual(seed);
    expect(encryptSeed(seed, key).equals(sealed)).toBe(false);
  });

  it('refuses a wrong key and a changed byte', () => {
    const sealed = encryptSeed(seed, key);
    expect(() => decryptSeed(sealed, randomBytes(32))).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decryptSeed(tampered, key)).toThrow();
  });
});
