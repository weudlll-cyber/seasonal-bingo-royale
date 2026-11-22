/**
 * @file   apps/server/src/config/seedKey.ts
 * @module server/config
 * @brief  The install's secret keys: the seed key (03 §9, 04 §3.3 seed_enc) and the recovery key.
 *
 * Responsibility: `SBR_SEED_KEY` seals match seeds and TOTP secrets at rest;
 *                 `SBR_RECOVERY_KEY` is what recovery codes are stored under (HMAC, K20; a key
 *                 of its own, so losing the seed key leaves the codes working). Both are 64 hex
 *                 characters and required — the server refuses to start without them; only
 *                 development (SBR_DEV=1) and the test suites derive fixed keys that protect
 *                 throw-away data.
 * Depends on:     ./env
 * Used by:        ../http/app, ../http/signIn, ../cli
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §3.3;
 *                 docs/concepts/kit-adoption.md §2 (B4)
 */
import { createHash } from 'node:crypto';

import type { Env } from './env.js';

// The key from the env file, or the fixed one of development (SBR_DEV=1) and the test suites.
function keyFrom(env: Env, name: 'SBR_SEED_KEY' | 'SBR_RECOVERY_KEY', fixed: string): Buffer {
  const value = env[name];
  if (value !== undefined) return Buffer.from(value, 'hex');
  if (!env.SBR_DEV && env.NODE_ENV !== 'test') {
    throw new Error(`${name} is required (only SBR_DEV=1 or tests use a fixed key)`);
  }
  return createHash('sha256').update(fixed).digest();
}

export const seedKeyFrom = (env: Env): Buffer =>
  keyFrom(env, 'SBR_SEED_KEY', 'sbr-development-only-seed-key');

// At start, not at the first recovery code: the kit refuses a key of one byte repeated.
export function recoveryKeyFrom(env: Env): Buffer {
  const key = keyFrom(env, 'SBR_RECOVERY_KEY', 'sbr-development-only-recovery-key');
  if (key.every((byte) => byte === key[0])) {
    throw new Error('SBR_RECOVERY_KEY must not be one byte repeated');
  }
  return key;
}
