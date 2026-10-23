/**
 * @file   apps/server/src/auth/rateLimit.test.ts
 * @module server/auth
 * @brief  Token buckets refill evenly and answer with a retry delay (03 §13).
 *
 * Responsibility: `limit` requests pass at once, the next is refused with the time until
 *                 one token is back, and keys are independent.
 * Depends on:     ./rateLimit
 * Spec:           docs/spec/03-security-architecture.md §13
 */
import { describe, expect, it } from 'vitest';

import { RateLimiter } from './rateLimit.js';

describe('RateLimiter', () => {
  it('lets the limit pass, then refuses with the delay until a token is back', () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 3, windowMs: 3_000 }, () => now);
    expect([1, 2, 3].map(() => limiter.take('a').allowed)).toEqual([true, true, true]);
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterMs: 1_000 });
    expect(limiter.take('b').allowed).toBe(true);
    now = 1_000;
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
  });

  it('forgets keys idle for a whole window, so the map stays small (audit S10)', () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 5, windowMs: 1_000 }, () => now);
    for (let i = 0; i < 999; i += 1) limiter.take(`old-${String(i)}`);
    expect(limiter.size).toBe(999);
    now = 1_000;
    limiter.take('new');
    expect(limiter.size).toBe(1);
  });
});
