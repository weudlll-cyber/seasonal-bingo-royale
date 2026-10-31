/**
 * @file   packages/application/src/match/timing.test.ts
 * @module application/match
 * @brief  The starter's timing choices kept inside the rules (01 §5, §6, D9, D12).
 *
 * Responsibility: the missed-number rule defaults to the auto-mark after the default delay
 *                 and never auto-marks inside the speed window; a timed-draw gap is kept
 *                 between 1 s after the longest tap time and the realtime maximum; the
 *                 owner's cards are computed with the chosen delay, or the default one.
 * Depends on:     @sbr/contracts, ./timing
 * Spec:           docs/spec/01-game-design.md §5, §6 (D9, D12)
 */
import { DEFAULT_AUTO_MARK_DELAY_MS, REALTIME_DRAW_INTERVAL_MS } from '@sbr/contracts';
import { describe, expect, it } from 'vitest';

import { chosenMissedNumbers, delayOf, withinDrawRange } from './timing.js';

const WINDOW = 3_000;

describe('the missed-number rule (D9)', () => {
  it('defaults to the auto-mark after the default delay', () => {
    expect(chosenMissedNumbers(undefined, WINDOW)).toEqual({
      kind: 'autoMarkAfter',
      delayMs: Math.max(WINDOW, DEFAULT_AUTO_MARK_DELAY_MS),
    });
  });

  it('keeps noAutoMark and never auto-marks inside the speed window', () => {
    expect(chosenMissedNumbers({ kind: 'noAutoMark' }, WINDOW)).toEqual({ kind: 'noAutoMark' });
    expect(chosenMissedNumbers({ kind: 'autoMarkAfter', delayMs: 1_000 }, WINDOW)).toEqual({
      kind: 'autoMarkAfter',
      delayMs: WINDOW,
    });
  });

  it("computes the owner's cards with the chosen delay, or the default one", () => {
    expect(delayOf({ kind: 'autoMarkAfter', delayMs: 7_000 })).toBe(7_000);
    expect(delayOf({ kind: 'noAutoMark' })).toBe(DEFAULT_AUTO_MARK_DELAY_MS);
  });
});

describe('the timed-draw gap (D12)', () => {
  const missed = { kind: 'autoMarkAfter', delayMs: 5_000 } as const;

  it('is at least 1 s after the longest tap time and at most the realtime maximum', () => {
    expect(withinDrawRange(1_000, WINDOW, missed)).toBe(6_000);
    expect(withinDrawRange(10 * 60_000, WINDOW, missed)).toBe(REALTIME_DRAW_INTERVAL_MS.max);
    expect(withinDrawRange(8_000, WINDOW, missed)).toBe(8_000);
    // Without the auto-mark the longest tap time is the speed window.
    expect(withinDrawRange(1_000, WINDOW, { kind: 'noAutoMark' })).toBe(WINDOW + 1_000);
  });
});
