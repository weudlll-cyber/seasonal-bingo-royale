/**
 * @file   apps/server/src/match/codec.test.ts
 * @module server/match
 * @brief  Seed encryption and the stored encoding of events and snapshots (match secrets at rest).
 *
 * Responsibility: encryptSeed/decryptSeed: the stored seed (04 §3.3 `seed_enc`) comes back
 *                 byte for byte with the right key, a fresh IV makes two seals differ, and a
 *                 wrong key or a changed byte fails instead of returning another seed (GCM
 *                 tag). encodeStored/decodeStored: a stored lobbyOpened or roundStarted holds
 *                 neither the seed nor the draw order in plain form, and both come back as
 *                 they were; a payload written before encoding version 2 still decodes; a
 *                 version-2 payload with a plain secret, or a wrong key, fails loudly and
 *                 names no secret.
 * Depends on:     vitest, node:crypto, ./codec
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/03-security-architecture.md §9
 */
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decodeStored, decryptSeed, encodeStored, encryptSeed } from './codec.js';

const key = randomBytes(32);
const seed = new Uint8Array(randomBytes(32));

describe('seed encryption', () => {
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

// A draw order long enough that its plain form cannot appear by chance.
const ORDER = Array.from({ length: 75 }, (_v, i) => ((i * 37) % 75) + 1);
const lobby = { type: 'lobbyOpened', matchId: 'm1', gameType: 'royale', seed, stagePlan: [] };
const round = {
  type: 'roundStarted',
  roundIndex: 0,
  drawSequence: ORDER,
  cardsByPlayer: { p1: [{ cells: [{ kind: 'number', value: 7 }], seasonCells: null }] },
};

// Every plain form a secret could take in stored JSON.
function plainForms(): string[] {
  const bytes = Buffer.from(seed);
  return [
    bytes.toString('hex'),
    bytes.toString('base64'),
    [...bytes].join(','),
    ORDER.slice(0, 12).join(','),
  ];
}

describe('stored encoding (match secrets at rest)', () => {
  it('stores neither the seed nor the draw order in plain form, and reads both back', () => {
    const stored = [encodeStored(lobby, key), encodeStored(round, key)];
    for (const text of stored) {
      for (const form of plainForms()) expect(text).not.toContain(form);
    }
    expect(decodeStored(stored[0], key)).toEqual(lobby);
    expect(decodeStored(stored[1], key)).toEqual(round);
  });

  it('seals a snapshot (match state) the same way', () => {
    const state = { matchId: 'm1', seed, currentRound: { drawSequence: ORDER, draws: [12] } };
    const text = encodeStored(state, key);
    for (const form of plainForms()) expect(text).not.toContain(form);
    expect(decodeStored(text, key)).toEqual(state);
  });

  it('still reads a payload stored before encoding version 2', () => {
    const plain = JSON.stringify({
      ...lobby,
      seed: { $bytes: Buffer.from(seed).toString('base64') },
    });
    expect(decodeStored(plain, key)).toEqual(lobby);
    expect(decodeStored(JSON.stringify(round), key)).toEqual(round);
    // jsonb gives the payload back as an object.
    expect(decodeStored(JSON.parse(JSON.stringify(round)), key)).toEqual(round);
  });

  it('refuses a version-2 payload with a plain secret, and a wrong key, naming no secret', () => {
    const forged = JSON.stringify({ ...round, $v: 2 });
    expect(() => decodeStored(forged, key)).toThrow('stored drawSequence is not sealed');
    const stored = encodeStored(lobby, key);
    const failure = (() => {
      try {
        decodeStored(stored, randomBytes(32));
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    expect(failure).not.toBeNull();
    for (const form of plainForms()) expect(failure).not.toContain(form);
  });
});
