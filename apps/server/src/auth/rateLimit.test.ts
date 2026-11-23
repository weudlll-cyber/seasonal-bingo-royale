/**
 * @file   apps/server/src/auth/rateLimit.test.ts
 * @module server/auth
 * @brief  Bingo's live rules drive the kit's RateLimiter: a changed limit applies at once (03 §13).
 *
 * Responsibility: `liveRule` with the Technical limits gives the kit's limiter a rule it reads on
 *                 every request; without them it is the default rule itself. The buckets'
 *                 refill, retry delay and pruning are the kit's and tested there
 *                 (seasonal-kit src/server/rateRule.test.ts).
 * Depends on:     vitest, @seasonal/kit/server (RateLimiter), ./rateLimit
 * Spec:           docs/spec/03-security-architecture.md §13
 */
import { RateLimiter } from '@seasonal/kit/server';
import { describe, expect, it } from 'vitest';

import { liveRule, RATE_RULES } from './rateLimit.js';

describe('liveRule', () => {
  it('is read on every request, so a changed limit applies at once (piece 7)', () => {
    let limit = 1;
    const limits = () => ({ ...TODAY, loginIp: limit });
    const limiter = new RateLimiter(liveRule('loginIp', limits), () => 0);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
    limit = 3;
    expect(limiter.take('b').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
  });

  it('is the default rule without the Technical settings, its window always the default', () => {
    expect(liveRule('loginIp')).toBe(RATE_RULES.loginIp);
    const rule = liveRule('register', () => ({ ...TODAY, register: 9 }));
    expect(typeof rule === 'function' ? rule() : rule).toEqual({
      limit: 9,
      windowMs: RATE_RULES.register.windowMs,
    });
  });
});

const TODAY = {
  loginAccountIp: 5,
  loginIp: 20,
  register: 5,
  api: 120,
  guest: 10,
  resetIp: 10,
  resetAccount: 3,
  twoFactor: 5,
};
