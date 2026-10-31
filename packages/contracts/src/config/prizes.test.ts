/**
 * @file   packages/contracts/src/config/prizes.test.ts
 * @module contracts/config
 * @brief  The prize key and prize list schemas cap the text a client may send.
 *
 * Responsibility: a prize key is 1 to PRIZE_KEY_MAX_LENGTH characters; every built-in
 *                 key fits; a list holds at most MAX_PRIZES keys, each capped, unique and
 *                 at least one (01 §3a.1).
 * Depends on:     vitest, ../index
 * Spec:           docs/spec/01-game-design.md §3a.1; docs/spec/05-api-design.md §2.3
 */
import { describe, expect, it } from 'vitest';

import {
  BUILTIN_PRIZE_KEYS,
  MAX_PRIZES,
  PRIZE_KEY_MAX_LENGTH,
  PrizeKeySchema,
  PrizeListSchema,
} from '../index.js';

describe('prize text is capped', () => {
  it('takes every built-in key and refuses an empty or overlong one', () => {
    for (const key of BUILTIN_PRIZE_KEYS) expect(PrizeKeySchema.safeParse(key).success).toBe(true);
    expect(PrizeKeySchema.safeParse('x'.repeat(PRIZE_KEY_MAX_LENGTH)).success).toBe(true);
    expect(PrizeKeySchema.safeParse('x'.repeat(PRIZE_KEY_MAX_LENGTH + 1)).success).toBe(false);
    expect(PrizeKeySchema.safeParse('').success).toBe(false);
  });

  it('refuses a list with an overlong key or more than the cap of keys', () => {
    expect(PrizeListSchema.safeParse(['fullCard', 'x'.repeat(10_000)]).success).toBe(false);
    const many = Array.from({ length: MAX_PRIZES + 1 }, (_v, i) => `custom-${String(i)}`);
    expect(PrizeListSchema.safeParse(many).success).toBe(false);
    expect(PrizeListSchema.safeParse(many.slice(0, MAX_PRIZES)).success).toBe(true);
  });
});
