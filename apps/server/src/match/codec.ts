/**
 * @file   apps/server/src/match/codec.ts
 * @module server/match
 * @brief  How events and match state are stored (match secrets sealed), and seed encryption.
 *
 * Responsibility: events and snapshots are stored as jsonb. Encoding version 2 (`"$v": 2`
 *                 in the stored JSON) seals the match secrets with the server's seed key:
 *                 every `seed` (bytes) and every round's `drawSequence` is written as
 *                 { "$sealed": base64 } through encryptSeed (AES-256-GCM) and opened on read
 *                 through decryptSeed, so the domain, replay, scheduler recovery and the
 *                 verification read the values unchanged (03 §9). A version-2 payload with a
 *                 secret in plain form is refused. Payloads stored before version 2 hold the
 *                 seed as { "$bytes": base64 } and the draw order as a plain list; they are
 *                 still read as they are (the event log is append-only, never rewritten).
 *                 The seed column itself (04 §3.3 `seed_enc`) uses the same encryption; its
 *                 public commitment is the domain's commitSeed (SHA-256). The public
 *                 projection of the event log drops the seed (01 §9: revealed only after
 *                 the match). No error names a secret.
 * Depends on:     node:crypto, @sbr/domain
 * Used by:        ./pgMatchStore, ../realtime/gateway, ../view/liveViews,
 *                 ../http/routes/matchVerify (decryptSeed, the seed reveal after a match),
 *                 ./codec.test
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/01-game-design.md §9; docs/spec/03-security-architecture.md §9
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { DomainEvent } from '@sbr/domain';

// The stored encoding that seals the match secrets; without "$v" a payload is version 1.
const SEALED_VERSION = 2;
const SECRETS = new Set(['seed', 'drawSequence']);

interface Sealed {
  readonly $sealed: string;
}

// An event or a match state as stored: secrets sealed, other bytes as base64.
export function encodeStored(value: object, key: Buffer): string {
  return JSON.stringify({ ...value, $v: SEALED_VERSION }, (name, v: unknown) => {
    if (name === 'seed' && v instanceof Uint8Array) return seal(v, key);
    if (name === 'drawSequence' && Array.isArray(v)) return seal(itemBytes(v), key);
    return v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString('base64') } : v;
  });
}

// Callers state the type they stored (a DomainEvent or a MatchState). jsonb may hand the
// payload back as an object or a string.
export function decodeStored(json: unknown, key: Buffer): unknown {
  const raw: unknown = typeof json === 'string' ? JSON.parse(json) : json;
  if (typeof raw !== 'object' || raw === null) return raw;
  const { $v, ...rest } = raw as Record<string, unknown>;
  return revive(rest, { key, sealed: $v === SEALED_VERSION }, '');
}

interface Reading {
  readonly key: Buffer;
  // Version 2: every secret must be sealed.
  readonly sealed: boolean;
}

function revive(v: unknown, reading: Reading, name: string): unknown {
  if (typeof v !== 'object' || v === null) return v;
  if ('$sealed' in v) {
    const bytes = decryptSeed(Buffer.from((v as Sealed).$sealed, 'base64'), reading.key);
    return name === 'drawSequence' ? [...bytes] : bytes;
  }
  // A secret in plain form is only allowed in a payload stored before version 2.
  if (reading.sealed && SECRETS.has(name)) throw new Error(`stored ${name} is not sealed`);
  if ('$bytes' in v) return new Uint8Array(Buffer.from((v as { $bytes: string }).$bytes, 'base64'));
  if (Array.isArray(v)) return v.map((item: unknown) => revive(item, reading, ''));
  return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, revive(item, reading, k)]));
}

function seal(bytes: Uint8Array, key: Buffer): Sealed {
  return { $sealed: encryptSeed(bytes, key).toString('base64') };
}

// A draw order as bytes: every item (numbers 1–75, season symbols 101–104) fits in one.
function itemBytes(items: readonly unknown[]): Uint8Array {
  return Uint8Array.from(items, (item) => {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 255) {
      throw new Error('draw item out of byte range');
    }
    return item;
  });
}

// What any viewer may see of an event: the seed stays secret until the match is over.
export function publicEvent(event: DomainEvent): DomainEvent {
  if (event.type !== 'lobbyOpened') return event;
  return { ...event, seed: new Uint8Array(0) };
}

// AES-256-GCM: 12-byte IV, 16-byte tag, then the ciphertext.
export function encryptSeed(seed: Uint8Array, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(seed), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSeed(sealed: Buffer, key: Buffer): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return new Uint8Array(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]));
}
