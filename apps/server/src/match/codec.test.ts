/**
 * @file   apps/server/src/match/codec.test.ts
 * @module server/match
 * @brief  Seed encryption and the stored encoding of events and snapshots (match secrets at rest).
 *
 * Responsibility: encryptSeed/decryptSeed: the stored seed (04 §3.3 `seed_enc`) round-trips with
 *                 the right key and match id, a fresh IV makes seals differ, and a wrong key,
 *                 another match's id or a changed byte fails (GCM tag, match id as AAD).
 *                 encodeStored/decodeStored: a stored lobbyOpened or roundStarted holds no plain
 *                 seed or draw order and round-trips; a sealed payload moved to another match
 *                 does not open; pre-v2 and v2 (unbound) payloads still decode; a plain secret
 *                 where a seal belongs, an unknown version, or a bad marker object fails loudly
 *                 and names no secret.
 * Depends on:     ./codec
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/03-security-architecture.md §9
 */
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { decodeStored, decryptSeed, encodeStored, encryptSeed } from './codec.js';

const key = randomBytes(32);
const seed = new Uint8Array(randomBytes(32));
const MATCH = '6f1f4c1e-0000-4000-8000-000000000001';
const OTHER = '6f1f4c1e-0000-4000-8000-000000000002';

describe('seed encryption', () => {
  it('opens what it sealed, with a fresh IV every time', () => {
    const sealed = encryptSeed(seed, key, MATCH);
    expect(decryptSeed(sealed, key, MATCH)).toEqual(seed);
    expect(encryptSeed(seed, key, MATCH).equals(sealed)).toBe(false);
  });

  it('refuses a wrong key, another match and a changed byte', () => {
    const sealed = encryptSeed(seed, key, MATCH);
    expect(() => decryptSeed(sealed, randomBytes(32), MATCH)).toThrow();
    expect(() => decryptSeed(sealed, key, OTHER)).toThrow();
    expect(() => decryptSeed(sealed, key, null)).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decryptSeed(tampered, key, MATCH)).toThrow();
  });

  it('still opens a seed sealed without a match id (stored before AAD binding)', () => {
    expect(decryptSeed(encryptSeed(seed, key, null), key, null)).toEqual(seed);
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

// The message a call fails with, or null when it does not fail.
function failure(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('stored encoding (match secrets at rest)', () => {
  it('stores neither the seed nor the draw order in plain form, and reads both back', () => {
    const stored = [encodeStored(lobby, key, MATCH), encodeStored(round, key, MATCH)];
    for (const text of stored) {
      for (const form of plainForms()) expect(text).not.toContain(form);
    }
    expect(decodeStored(stored[0], key, MATCH)).toEqual(lobby);
    expect(decodeStored(stored[1], key, MATCH)).toEqual(round);
  });

  it('seals a snapshot (match state) the same way', () => {
    const state = { matchId: 'm1', seed, currentRound: { drawSequence: ORDER, draws: [12] } };
    const text = encodeStored(state, key, MATCH);
    for (const form of plainForms()) expect(text).not.toContain(form);
    expect(decodeStored(text, key, MATCH)).toEqual(state);
  });

  it('binds every seal to its match: a payload moved to another match does not open', () => {
    const stored = encodeStored(round, key, MATCH);
    expect(JSON.parse(stored)).toMatchObject({ $v: 3 });
    expect(() => decodeStored(stored, key, OTHER)).toThrow();
  });

  it('still reads payloads stored before encoding version 2, and version 2', () => {
    const plain = JSON.stringify({
      ...lobby,
      seed: { $bytes: Buffer.from(seed).toString('base64') },
    });
    expect(decodeStored(plain, key, MATCH)).toEqual(lobby);
    expect(decodeStored(JSON.stringify(round), key, MATCH)).toEqual(round);
    // jsonb gives the payload back as an object.
    expect(decodeStored(JSON.parse(JSON.stringify(round)), key, MATCH)).toEqual(round);
    // Version 2 sealed without the match id; it opens for whichever match reads it.
    const v2 = JSON.stringify({
      ...lobby,
      $v: 2,
      seed: { $sealed: encryptSeed(seed, key, null).toString('base64') },
    });
    expect(decodeStored(v2, key, MATCH)).toEqual(lobby);
  });
});

describe('stored encoding: strict decoding', () => {
  it('refuses a plain secret where it must be sealed, and a wrong key, naming no secret', () => {
    for (const v of [2, 3]) {
      const forged = JSON.stringify({ ...round, $v: v });
      expect(() => decodeStored(forged, key, MATCH)).toThrow('stored drawSequence is not sealed');
    }
    const message = failure(() =>
      decodeStored(encodeStored(lobby, key, MATCH), randomBytes(32), MATCH),
    );
    expect(message).not.toBeNull();
    for (const form of plainForms()) expect(message).not.toContain(form);
  });

  it('refuses an unknown version and marker objects with extra or wrong fields', () => {
    const sealed = encryptSeed(seed, key, MATCH).toString('base64');
    const forged = [
      { ...lobby, $v: 4, seed: { $sealed: sealed } },
      { ...lobby, $v: '3', seed: { $sealed: sealed } },
      { ...lobby, $v: 3, seed: { $sealed: sealed, extra: 1 } },
      { ...lobby, $v: 3, seed: { $sealed: 42 } },
      { ...lobby, $v: 3, seed: { $sealed: sealed }, title: { $bytes: 'AA==', more: true } },
      { ...lobby, $v: 3, seed: { $sealed: sealed }, title: { $other: 'x' } },
      // A seal under a field that is not a secret, and a seal in a payload from before sealing.
      { ...lobby, $v: 3, seed: { $sealed: sealed }, title: { $sealed: sealed } },
      { ...lobby, seed: { $sealed: sealed } },
    ];
    for (const value of forged) {
      const message = failure(() => decodeStored(JSON.stringify(value), key, MATCH));
      expect(message, JSON.stringify(value).slice(0, 80)).not.toBeNull();
      for (const form of plainForms()) expect(message).not.toContain(form);
    }
  });
});
