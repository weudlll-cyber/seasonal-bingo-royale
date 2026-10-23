/**
 * @file   apps/server/src/config/seedKey.ts
 * @module server/config
 * @brief  The key that seals match seeds at rest (03 §9, 04 §3.3 seed_enc).
 *
 * Responsibility: `SBR_SEED_KEY` (64 hex characters) is required — the server refuses
 *                 to start without it; only development (SBR_DEV=1) and the test suites
 *                 derive a fixed key that protects throw-away data.
 * Depends on:     node:crypto, ./env
 * Used by:        ../http/app
 * Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §3.3
 */
import { createHash } from 'node:crypto';

import type { Env } from './env.js';

export function seedKeyFrom(env: Env): Buffer {
  if (env.SBR_SEED_KEY !== undefined) return Buffer.from(env.SBR_SEED_KEY, 'hex');
  // The fixed key only for development (SBR_DEV=1) and the test suites.
  if (!env.SBR_DEV && env.NODE_ENV !== 'test') {
    throw new Error('SBR_SEED_KEY is required (only SBR_DEV=1 or tests use a fixed key)');
  }
  return createHash('sha256').update('sbr-development-only-seed-key').digest();
}
