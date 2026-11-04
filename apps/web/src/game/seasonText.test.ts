/**
 * @file   apps/web/src/game/seasonText.test.ts
 * @module web/game
 * @brief  How many numbers a Summer boost or Spring growth still covers, in plain words.
 *
 * Responsibility: "1 more number", "5 more numbers", and on the effect's last draw (the server
 *                 counts the draws still to come after this one, audit-3 G3) "this number only".
 * Depends on:     vitest, ./seasonText
 * Spec:           docs/spec/01-game-design.md §8.2, §13
 */
import { describe, expect, it } from 'vitest';

import { boostSentence, growthSentence } from './seasonText.js';

describe('the numbers an effect still covers', () => {
  it('counts the numbers to come, and says "this number only" on the last one', () => {
    expect(boostSentence('summer', 1.5, 5)).toBe(
      'Summer boost: all your points count ×1.5 — 5 more numbers',
    );
    expect(growthSentence('spring', 1)).toBe(
      'Spring growth: every mark earns extra points, more with each mark — 1 more number',
    );
    expect(boostSentence('summer', 1.5, 0)).toBe(
      'Summer boost: all your points count ×1.5 — this number only',
    );
  });
});
