/**
 * @file   apps/server/src/auth/sessions.test.ts
 * @module server/auth
 * @brief  A cookie that cannot be a session token never reaches the database (audit-3 S5).
 *
 * Responsibility: tokens of the wrong length or with characters outside base64url are refused
 *                 by their format alone (no query); a well-formed one is looked up.
 * Depends on:     vitest, ./sessions, ../db/pool (types)
 * Spec:           docs/spec/03-security-architecture.md §3, §13
 */
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { DbPool } from '../db/pool.js';
import { findSession } from './sessions.js';

// A pool that answers every query with no rows and counts them.
function countingPool() {
  const counter = { queries: 0 };
  const pool = {
    query: () => {
      counter.queries += 1;
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  } as unknown as DbPool;
  return { pool, counter };
}

describe('the session token format (audit-3 S5)', () => {
  it.each(['', 'short', 'x'.repeat(200), `${'a'.repeat(42)}!`, `${'a'.repeat(42)}=`])(
    'refuses %j without a query',
    async (token) => {
      const { pool, counter } = countingPool();
      expect(await findSession(pool, token)).toBeNull();
      expect(counter.queries).toBe(0);
    },
  );

  it('looks up a well-formed token', async () => {
    const { pool, counter } = countingPool();
    expect(await findSession(pool, randomBytes(32).toString('base64url'))).toBeNull();
    expect(counter.queries).toBe(1);
  });
});
