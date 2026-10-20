/**
 * @file   apps/web/src/manualMarking.test.ts
 * @module web
 * @brief  Unit tests for the Quick Test manual-marking rules (01 §6, WP-08).
 *
 * Responsibility: prove that a missed drawn cell is auto-marked exactly when its speed
 *                 window closes (not after a number of draws), without bonus; that taps
 *                 on drawn cells earn the decaying speed bonus; that undrawn taps are
 *                 refused.
 * Depends on:     ./manualMarking, ./types
 * Spec:           docs/spec/01-game-design.md §6, §8.1
 */
import { describe, expect, it } from 'vitest';

import {
  closeExpiredWindows,
  initialManualState,
  nextWindowClose,
  speedBonus,
  tapCell,
  type ManualRules,
} from './manualMarking.js';
import type { Cell } from './types.js';

const RULES: ManualRules = { pointsPerMark: 10, maxSpeedBonus: 10, speedWindowMs: 3000 };

// Row-major 5×5 card: numbers 1..24 around a free centre (index 12).
const CELLS: readonly Cell[] = Array.from({ length: 25 }, (_v, i) =>
  i === 12 ? { kind: 'free' as const } : { kind: 'number' as const, value: i < 12 ? i + 1 : i },
);

describe('closeExpiredWindows', () => {
  it('auto-marks a missed drawn cell as soon as its window closes, after a single draw', () => {
    const state = initialManualState(CELLS);
    const drawTimes = new Map([[5, 1_000]]); // number 5 sits at index 4
    const closed = closeExpiredWindows({
      state,
      cells: CELLS,
      drawTimes,
      now: 4_000,
      rules: RULES,
    });
    expect(closed.marks[4]).toBe(true);
    expect(closed.points).toBe(10);
    expect(closed.bonusEarned).toBe(0);
    expect(closed.feedback).toEqual({ kind: 'autoMarked', count: 1 });
  });

  it('does not auto-mark while the window is still open, even after many draws', () => {
    const state = initialManualState(CELLS);
    // Eleven draws, the last one (number 11 at index 10) only 2.9 s ago.
    const drawTimes = new Map(Array.from({ length: 11 }, (_v, i) => [i + 1, i < 10 ? 0 : 1_100]));
    const closed = closeExpiredWindows({
      state,
      cells: CELLS,
      drawTimes,
      now: 4_000,
      rules: RULES,
    });
    expect(closed.marks[10]).toBe(false);
    expect(closed.marks[0]).toBe(true);
  });
});

describe('tapCell', () => {
  it('marks a drawn cell and earns the decaying speed bonus', () => {
    const state = initialManualState(CELLS);
    const drawTimes = new Map([[5, 1_000]]);
    const tapped = tapCell({ state, cells: CELLS, index: 4, drawTimes, now: 2_500, rules: RULES });
    expect(tapped.marks[4]).toBe(true);
    expect(tapped.feedback).toEqual({ kind: 'marked', points: 15, bonus: 5 });
  });

  it('refuses a tap on an undrawn cell', () => {
    const state = initialManualState(CELLS);
    const tapped = tapCell({
      state,
      cells: CELLS,
      index: 4,
      drawTimes: new Map(),
      now: 0,
      rules: RULES,
    });
    expect(tapped.marks[4]).toBe(false);
    expect(tapped.feedback).toEqual({ kind: 'refused' });
  });
});

describe('speedBonus and nextWindowClose', () => {
  it('is the maximum at delta 0 and 0 at the end of the window', () => {
    expect(speedBonus(RULES, 0)).toBe(10);
    expect(speedBonus(RULES, 3_000)).toBe(0);
    expect(speedBonus(RULES, 3_001)).toBe(0);
  });

  it('reports the earliest pending window close', () => {
    const state = initialManualState(CELLS);
    const drawTimes = new Map([
      [5, 2_000],
      [6, 1_000],
    ]);
    expect(nextWindowClose(state, CELLS, drawTimes, RULES)).toBe(4_000);
  });
});
