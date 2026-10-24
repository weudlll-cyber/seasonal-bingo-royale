/**
 * @file   apps/server/src/match/codec.ts
 * @module server/match
 * @brief  JSON for domain events and match state (bytes as base64), and seed encryption.
 *
 * Responsibility: events and snapshots are stored as jsonb; the only non-JSON value they
 *                 hold is the seed (Uint8Array), written as { "$bytes": base64 } and read
 *                 back. The seed itself is stored AES-256-GCM encrypted with the server's
 *                 seed key (04 §3.3 `seed_enc`); its public commitment is the domain's
 *                 commitSeed (SHA-256).
 *                 The public projection of the event log drops the seed (01 §9: revealed
 *                 only after the match).
 * Depends on:     node:crypto, @sbr/domain
 * Used by:        ./pgMatchStore, ../realtime/gateway, ../view/liveViews,
 *                 ../http/routes/matchVerify (decryptSeed, the seed reveal after a match),
 *                 ./codec.test
 * Spec:           docs/spec/04-database-design.md §3.3; docs/spec/01-game-design.md §9; docs/spec/03-security-architecture.md §9
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { DomainEvent } from '@sbr/domain';

export function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Uint8Array ? { $bytes: Buffer.from(v).toString('base64') } : v,
  );
}

// Callers state the type they stored (a DomainEvent or a MatchState).
export function fromJson(json: unknown): unknown {
  const text = typeof json === 'string' ? json : JSON.stringify(json);
  return JSON.parse(text, (_key, v: unknown) => {
    if (typeof v === 'object' && v !== null && '$bytes' in v) {
      return new Uint8Array(Buffer.from((v as { $bytes: string }).$bytes, 'base64'));
    }
    return v;
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
