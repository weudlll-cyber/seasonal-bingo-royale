/**
 * @file   packages/domain/src/draw/drbg.ts
 * @module domain/draw
 * @brief  Deterministic random byte generator built on HMAC-SHA256 (01 §9).
 *
 * Responsibility: given a 32-byte secret seed and a domain-separation label, return
 *                 a cursor that yields pseudo-random uint32 values and bounded ints,
 *                 reproducible across runs. Pure: same inputs give the same stream.
 *                 The construction is "HMAC(seed, label || counter)" — a counter-mode
 *                 DRBG keyed by the seed, matching the spec's "HMAC-SHA256 counter DRBG
 *                 with domain separation per round and purpose".
 * Depends on:     node:crypto (HMAC-SHA256 — pure in/out)
 * Used by:        ./drawSequence.ts, ../card/generateCard.ts, ../index
 * Spec:           docs/spec/01-game-design.md §9, docs/spec/12-testing-strategy.md §3
 */
import { createHmac } from 'node:crypto';

export interface Drbg {
  readonly nextUint32: () => number;
  readonly nextInt: (exclusiveMax: number) => number;
}

export const SEED_BYTES = 32;

export function createDrbg(seed: Uint8Array, label: string): Drbg {
  if (seed.byteLength !== SEED_BYTES) {
    throw new Error(`seed must be ${String(SEED_BYTES)} bytes; got ${String(seed.byteLength)}`);
  }
  const key = Buffer.from(seed);
  const labelBytes = Buffer.from(label, 'utf8');
  let counter = 0;
  let block: Buffer = Buffer.alloc(0);
  let offset = block.byteLength;
  const refill = (): void => {
    const message = Buffer.concat([labelBytes, encodeCounter(counter)]);
    block = createHmac('sha256', key).update(message).digest();
    offset = 0;
    counter += 1;
  };
  const nextUint32 = (): number => {
    if (offset + 4 > block.byteLength) refill();
    const value = block.readUInt32BE(offset);
    offset += 4;
    return value;
  };
  const nextInt = (exclusiveMax: number): number => {
    if (exclusiveMax < 1) throw new Error('exclusiveMax must be at least 1');
    // Rejection sampling keeps the distribution flat even when exclusiveMax does not
    // divide 2^32 evenly — stays deterministic because the DRBG is deterministic.
    const limit = Math.floor(0x100000000 / exclusiveMax) * exclusiveMax;
    for (;;) {
      const value = nextUint32();
      if (value < limit) return value % exclusiveMax;
    }
  };
  return { nextUint32, nextInt };
}

function encodeCounter(counter: number): Buffer {
  const buffer = Buffer.alloc(8);
  // High 32 bits stay zero: 2^32 blocks of 32 bytes is 128 GiB per DRBG — far more than
  // any match will ever use. We still write the full 64-bit field for clarity.
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(counter, 4);
  return buffer;
}
