/**
 * @file   packages/domain/src/commitment.ts
 * @module domain
 * @brief  Seed commitment: `sha256(seed)` with constant-time verification.
 *
 * Responsibility: compute the public commitment stored on the match at lobby open
 *                 (01 §9, 04 §3.3 `matches.seed_commitment`) and verify a published
 *                 seed against it. The verify helper uses crypto.timingSafeEqual so a
 *                 later verification endpoint cannot leak byte-by-byte comparison.
 * Depends on:     nothing
 * Used by:        ./index, apps/server/src/match/pgMatchStore (commitSeed), ./verifyMatch
 *                 (verifyCommitment)
 * Spec:           docs/spec/01-game-design.md §9
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export function commitSeed(seed: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(seed).digest());
}

export function verifyCommitment(seed: Uint8Array, commitment: Uint8Array): boolean {
  const computed = commitSeed(seed);
  if (computed.byteLength !== commitment.byteLength) return false;
  return timingSafeEqual(computed, commitment);
}
