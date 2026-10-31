/**
 * @file   apps/server/src/match/codec.ts
 * @module server/match
 * @brief  How events and match state are stored (match secrets sealed), and seed encryption.
 *
 * Responsibility: events and snapshots are stored as jsonb. Encoding v3 (`"$v": 3`) seals each
 *                 `seed` and `drawSequence` as { "$sealed": base64 } (encryptSeed: AES-256-GCM,
 *                 match id as AAD); reads unseal transparently (03 §9). Older payloads stay
 *                 readable (append-only log): v2 is unbound; no "$v" means a { "$bytes" } seed
 *                 and a plain draw list. Decoding is strict (unknown version, misplaced secret or
 *                 seal, bad marker: refused). The seed column (04 §3.3 `seed_enc`;
 *                 `seed_enc_version` 3 bound, 2 not) is sealed alike; commitSeed (SHA-256) is
 *                 public; the public log drops the seed (01 §9). No error names a secret.
 * Depends on:     @sbr/domain
 * Used by:        ./pgMatchStore, ./sealedSeedCheck, ../realtime/gateway, ../view/liveViews,
 *                 ../http/routes/matchVerify (openSeedColumn, the seed reveal after a match)
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/01-game-design.md §9; docs/spec/03-security-architecture.md §9
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { DomainEvent } from '@sbr/domain';

// Stored encodings: without "$v" version 1 (plain), 2 sealed, 3 sealed and bound to the
// match id. New payloads and new seed columns are written as version 3.
const SEALED_VERSION = 2;
const BOUND_VERSION = 3;
export const SEED_COLUMN_VERSION = BOUND_VERSION;
const SECRETS = new Set(['seed', 'drawSequence']);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

interface Sealed {
  readonly $sealed: string;
}

interface Marker {
  readonly kind: '$sealed' | '$bytes';
  readonly value: string;
}

// An event or a match state as stored: secrets sealed for this match, other bytes as base64.
export function encodeStored(value: object, key: Buffer, matchId: string): string {
  return JSON.stringify({ ...value, $v: BOUND_VERSION }, (name, v: unknown) => {
    if (name === 'seed' && v instanceof Uint8Array) return seal(v, key, matchId);
    if (name === 'drawSequence' && Array.isArray(v)) return seal(itemBytes(v), key, matchId);
    return v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString('base64') } : v;
  });
}

// Callers state the type they stored (a DomainEvent or a MatchState) and the match it
// belongs to. jsonb may hand the payload back as an object or a string.
export function decodeStored(json: unknown, key: Buffer, matchId: string): unknown {
  const raw: unknown = typeof json === 'string' ? JSON.parse(json) : json;
  if (typeof raw !== 'object' || raw === null) return raw;
  const { $v, ...rest } = raw as Record<string, unknown>;
  return revive(rest, readingFor($v, key, matchId), '');
}

interface Reading {
  readonly key: Buffer;
  // Version 2 and 3: every secret must be sealed; version 1 holds no seal at all.
  readonly sealed: boolean;
  // Version 3: the additional authenticated data of every seal; null before.
  readonly aad: string | null;
}

function readingFor(version: unknown, key: Buffer, matchId: string): Reading {
  if (version === undefined) return { key, sealed: false, aad: null };
  if (version === SEALED_VERSION) return { key, sealed: true, aad: null };
  if (version === BOUND_VERSION) return { key, sealed: true, aad: matchId };
  throw new Error('unknown stored encoding version');
}

function revive(v: unknown, reading: Reading, name: string): unknown {
  if (typeof v !== 'object' || v === null) return v;
  const marker = Array.isArray(v) ? null : markerOf(v as Record<string, unknown>);
  if (marker?.kind === '$sealed') return unseal(marker.value, reading, name);
  // A secret in plain form is only allowed in a payload stored before version 2.
  if (reading.sealed && SECRETS.has(name)) throw new Error(`stored ${name} is not sealed`);
  if (marker?.kind === '$bytes') return new Uint8Array(Buffer.from(marker.value, 'base64'));
  if (Array.isArray(v)) return v.map((item: unknown) => revive(item, reading, ''));
  return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, revive(item, reading, k)]));
}

// A marker object ({ $sealed } or { $bytes }) has exactly that one field, a base64 string;
// any other field starting with "$" is refused. Null for a plain object.
function markerOf(v: Record<string, unknown>): Marker | null {
  const keys = Object.keys(v);
  if (!keys.some((k) => k.startsWith('$'))) return null;
  const kind = keys[0];
  const value = kind === undefined ? undefined : v[kind];
  if (kind !== '$sealed' && kind !== '$bytes') throw new Error('malformed stored marker');
  if (keys.length !== 1 || typeof value !== 'string' || !BASE64.test(value)) {
    throw new Error('malformed stored marker');
  }
  return { kind, value };
}

function unseal(value: string, reading: Reading, name: string): unknown {
  // Seals exist only from version 2 on, and only for the secrets.
  if (!reading.sealed || !SECRETS.has(name)) throw new Error('unexpected stored seal');
  const bytes = decryptSeed(Buffer.from(value, 'base64'), reading.key, reading.aad);
  return name === 'drawSequence' ? [...bytes] : bytes;
}

function seal(bytes: Uint8Array, key: Buffer, matchId: string): Sealed {
  return { $sealed: encryptSeed(bytes, key, matchId).toString('base64') };
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

// AES-256-GCM: 12-byte IV, 16-byte tag, then the ciphertext. `matchId` is bound as
// additional authenticated data; null only for what was sealed before that (version 2).
export function encryptSeed(seed: Uint8Array, key: Buffer, matchId: string | null): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  if (matchId !== null) cipher.setAAD(Buffer.from(matchId, 'utf8'));
  const body = Buffer.concat([cipher.update(seed), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSeed(sealed: Buffer, key: Buffer, matchId: string | null): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  if (matchId !== null) decipher.setAAD(Buffer.from(matchId, 'utf8'));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return new Uint8Array(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]));
}

// The seed column of a match row (04 §3.3): version 3 is bound to the match id, version 2
// (stored before the binding) is not.
export interface SeedColumn {
  readonly id: string;
  readonly seed_enc: Buffer;
  readonly seed_enc_version: number;
}

export function openSeedColumn(row: SeedColumn, key: Buffer): Uint8Array {
  const aad = row.seed_enc_version === BOUND_VERSION ? row.id : null;
  return decryptSeed(row.seed_enc, key, aad);
}
