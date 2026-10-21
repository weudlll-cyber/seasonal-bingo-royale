/**
 * @file   apps/server/src/config/seedKey.ts
 * @module server/config
 * @brief  The key that seals match seeds at rest (03 §9, 04 §3.3 seed_enc).
 *
 * Responsibility: `SBR_SEED_KEY` (64 hex characters) in production — the server refuses
 *                 to start without it; development and tests derive a fixed key that only
 *                 protects throw-away data.
 * Depends on:     node:crypto, ./env
 * Used by:        ../http/app
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §3.3
 */
import { createHash } from 'node:crypto';

import type { Env } from './env.js';

export function seedKeyFrom(env: Env): Buffer {
  if (env.SBR_SEED_KEY !== undefined) return Buffer.from(env.SBR_SEED_KEY, 'hex');
  if (env.NODE_ENV === 'production') throw new Error('SBR_SEED_KEY is required in production');
  return createHash('sha256').update('sbr-development-only-seed-key').digest();
}
