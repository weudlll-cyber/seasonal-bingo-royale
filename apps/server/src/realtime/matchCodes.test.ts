/**
 * @file   apps/server/src/realtime/matchCodes.test.ts
 * @module server/realtime
 * @brief  The gateway looks a match code up once (the tap breakdown of 12 §5).
 *
 * Responsibility: a code found in the database is answered from memory afterwards (a match
 *                 never changes its code and is never deleted, only aborted); a code not found
 *                 is asked again next time (a match created a moment later); the memory holds
 *                 a bounded number of codes.
 * Depends on:     vitest, ./matchCodes, ../db/pool (type)
 * Spec:           docs/spec/12-testing-strategy.md §5; docs/spec/06-realtime-architecture.md §4
 */
import { describe, expect, it } from 'vitest';

import type { DbPool } from '../db/pool.js';
import { MatchCodes } from './matchCodes.js';

// A pool that knows the given codes and counts its queries.
function poolWith(codes: Record<string, string>): { pool: DbPool; queries: () => number } {
  let n = 0;
  const pool = {
    query: (_sql: string, params: readonly string[]) => {
      n += 1;
      const id = codes[params[0] ?? ''];
      return Promise.resolve({ rows: id === undefined ? [] : [{ id }] });
    },
  } as unknown as DbPool;
  return { pool, queries: () => n };
}

describe('match codes in the gateway (12 §5)', () => {
  it('asks the database once per code it found', async () => {
    const { pool, queries } = poolWith({ ABC123: 'm-1' });
    const codes = new MatchCodes(pool);
    expect(await codes.idOf('ABC123')).toBe('m-1');
    expect(await codes.idOf('ABC123')).toBe('m-1');
    expect(queries()).toBe(1);
  });

  it('asks again for a code it did not find', async () => {
    const { pool, queries } = poolWith({});
    const codes = new MatchCodes(pool);
    expect(await codes.idOf('NEW111')).toBeNull();
    expect(await codes.idOf('NEW111')).toBeNull();
    expect(queries()).toBe(2);
  });

  it('keeps a bounded number of codes', async () => {
    const known = Object.fromEntries(
      Array.from({ length: 5 }, (_v, i) => [`C${String(i)}`, `m${String(i)}`]),
    );
    const { pool, queries } = poolWith(known);
    const codes = new MatchCodes(pool, 3);
    for (let i = 0; i < 5; i += 1) await codes.idOf(`C${String(i)}`);
    expect(codes.size).toBeLessThanOrEqual(3);
    await codes.idOf('C4');
    expect(queries()).toBe(5);
  });
});
