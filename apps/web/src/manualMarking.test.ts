/**
 * @file   apps/web/src/manualMarking.test.ts
 * @module web
 * @brief  Unit tests for the Quick Test manual-marking rules (01 §6, D9, WP-08).
 *
 * Responsibility: prove that under autoMarkAfter a missed drawn cell is marked for the
 *                 owner exactly when the chosen delay has passed (not when the speed
 *                 window closes), without bonus; that under noAutoMark it stays open and
 *                 a later tap marks it without bonus; that taps inside the window earn the
 *                 decaying speed bonus; that undrawn taps are refused.
 * Depends on:     ./manualMarking, ./types
 * Spec:           docs/spec/01-game-design.md §6, §8.1
 */
import { describe, expect, it } from 'vitest';

import {
  autoMarkMissed,
  feedbackText,
  initialManualState,
  nextAutoMark,
  speedBonus,
  tapCell,
  type ManualRules,
} from './manualMarking.js';
import type { Cell } from './types.js';

const AFTER_5S: ManualRules = {
  maxSpeedBonus: 10,
  speedWindowMs: 3000,
  missedNumbers: { kind: 'autoMarkAfter', delayMs: 5000 },
};
const LEAVE_OPEN: ManualRules = { ...AFTER_5S, missedNumbers: { kind: 'noAutoMark' } };

// Row-major 5×5 card: numbers 1..24 around a free centre (index 12).
const CELLS: readonly Cell[] = Array.from({ length: 25 }, (_v, i) =>
  i === 12 ? { kind: 'free' as const } : { kind: 'number' as const, value: i < 12 ? i + 1 : i },
);
const FIVE_AT_1S = new Map([[5, 1_000]]); // number 5 sits at index 4, drawn at t = 1 s

describe('autoMarkMissed', () => {
  it('marks a missed cell exactly when the chosen delay has passed, not at the window', () => {
    const state = initialManualState(CELLS);
    const at = (now: number) =>
      autoMarkMissed({ state, cells: CELLS, drawTimes: FIVE_AT_1S, now, rules: AFTER_5S });
    expect(at(4_000).marks[4]).toBe(false); // window closed, delay not yet
    expect(at(5_999).marks[4]).toBe(false);
    const marked = at(6_000);
    expect(marked.marks[4]).toBe(true);
    expect(marked.bonusEarned).toBe(0);
    expect(marked.feedback).toEqual({ kind: 'autoMarked', count: 1, delayMs: 5000 });
    expect(feedbackText(marked.feedback)).toBe('Marked 1 for you without bonus (after 5 s)');
  });

  it('leaves a missed cell open under noAutoMark, however long ago it was drawn', () => {
    const state = initialManualState(CELLS);
    const open = autoMarkMissed({
      state,
      cells: CELLS,
      drawTimes: FIVE_AT_1S,
      now: 600_000,
      rules: LEAVE_OPEN,
    });
    expect(open.marks[4]).toBe(false);
    expect(nextAutoMark(state, CELLS, FIVE_AT_1S, LEAVE_OPEN)).toBeNull();
  });
});

describe('tapCell', () => {
  it('marks a drawn cell inside the window and earns the decaying speed bonus', () => {
    const state = initialManualState(CELLS);
    const tapped = tapCell({
      state,
      cells: CELLS,
      index: 4,
      drawTimes: FIVE_AT_1S,
      now: 2_500,
      rules: AFTER_5S,
    });
    expect(tapped.marks[4]).toBe(true);
    expect(tapped.feedback).toEqual({ kind: 'marked', bonus: 5 });
    expect(tapped.bonusEarned).toBe(5);
  });

  it('marks a late tap without bonus (noAutoMark keeps the cell tappable)', () => {
    const state = initialManualState(CELLS);
    const tapped = tapCell({
      state,
      cells: CELLS,
      index: 4,
      drawTimes: FIVE_AT_1S,
      now: 60_000,
      rules: LEAVE_OPEN,
    });
    expect(tapped.marks[4]).toBe(true);
    expect(tapped.bonusEarned).toBe(0);
    expect(feedbackText(tapped.feedback)).toBe('Marked late · no speed bonus');
  });

  it('refuses a tap on an undrawn cell', () => {
    const state = initialManualState(CELLS);
    const tapped = tapCell({
      state,
      cells: CELLS,
      index: 4,
      drawTimes: new Map(),
      now: 0,
      rules: AFTER_5S,
    });
    expect(tapped.marks[4]).toBe(false);
    expect(tapped.feedback).toEqual({ kind: 'refused' });
  });
});

describe('speedBonus and nextAutoMark', () => {
  it('is the maximum at delta 0 and 0 at the end of the window', () => {
    expect(speedBonus(AFTER_5S, 0)).toBe(10);
    expect(speedBonus(AFTER_5S, 3_000)).toBe(0);
    expect(speedBonus(AFTER_5S, 3_001)).toBe(0);
  });

  it('reports the earliest pending auto-mark at draw time plus the delay', () => {
    const state = initialManualState(CELLS);
    const drawTimes = new Map([
      [5, 2_000],
      [6, 1_000],
    ]);
    expect(nextAutoMark(state, CELLS, drawTimes, AFTER_5S)).toBe(6_000);
  });
});
