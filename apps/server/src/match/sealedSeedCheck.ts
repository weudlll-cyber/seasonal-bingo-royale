/**
 * @file   apps/server/src/match/sealedSeedCheck.ts
 * @module server/match
 * @brief  Proves a seed key opens the stored match secrets: one sealed seed is decrypted.
 *
 * Responsibility: read the newest lobbyOpened event stored with a sealed seed (encoding
 *                 version 2, or 3 bound to its match id, ./codec) and open it with the given
 *                 key through the codec's own decoding; a wrong key fails the AES-GCM tag
 *                 and throws a plain error that names no secret. No such event is reported
 *                 as "none", not as a failure. The backup drill runs it on the restored copy
 *                 with the backup's key (`node dist/cli.js check-seed-key`).
 * Depends on:     ../db/pool, ./codec
 * Used by:        ../cli, ../../test/seedAtRest.integration.test
 * Spec:           docs/spec/09-deployment-architecture.md §6; docs/spec/03-security-architecture.md §9
 */
import type { DbPool } from '../db/pool.js';
import { decodeStored } from './codec.js';

export type SealedSeedCheck = 'opened' | 'none';

export async function openOneSealedSeed(pool: DbPool, key: Buffer): Promise<SealedSeedCheck> {
  const r = await pool.query<{ match_id: string; payload: unknown }>(
    `SELECT match_id, payload FROM sbr.match_events
      WHERE type = 'lobbyOpened' AND payload->>'$v' IN ('2', '3')
      ORDER BY occurred_at DESC, seq DESC LIMIT 1`,
  );
  const row = r.rows[0];
  if (row === undefined) return 'none';
  let seed: unknown;
  try {
    seed = (decodeStored(row.payload, key, row.match_id) as { seed?: unknown }).seed;
  } catch {
    throw new Error('SBR_SEED_KEY does not open the stored match secrets (wrong key?)');
  }
  // A sealed lobbyOpened without a seed would be refused by the codec already;
  // an empty one would prove nothing.
  if (!(seed instanceof Uint8Array) || seed.length === 0) {
    throw new Error('the newest sealed lobbyOpened event holds no seed');
  }
  return 'opened';
}
