/**
 * @file   packages/application/src/match/timing.ts
 * @module application/match
 * @brief  Timing inputs of a match: missed-number rule, owner delay, draw gap (01 §5, §6).
 *
 * Responsibility: turn the starter's choices into the values a match runs with (live
 *                 engine and Quick Test):
 *                 the missed-number rule with its delay raised to at least the speed
 *                 window, the delay the owner's cards are computed with (the owner's
 *                 later taps are not known before playback, so noAutoMark uses the
 *                 default delay), and the timed-draw gap kept inside the allowed range,
 *                 which is always longer than the speed window (D10).
 * Depends on:     @sbr/contracts, @sbr/domain (types)
 * Used by:        ./engine, apps/server/src/dev/quicktest.ts
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { DEFAULT_AUTO_MARK_DELAY_MS, REALTIME_DRAW_INTERVAL_MS } from '@sbr/contracts';
import type { MissedNumbers } from '@sbr/domain';

// The starter's rule; an autoMarkAfter delay is never shorter than the speed window.
export function chosenMissedNumbers(
  chosen: MissedNumbers | undefined,
  speedWindowMs: number,
): MissedNumbers {
  const rule = chosen ?? { kind: 'autoMarkAfter', delayMs: DEFAULT_AUTO_MARK_DELAY_MS };
  if (rule.kind === 'noAutoMark') return rule;
  return { kind: 'autoMarkAfter', delayMs: Math.max(speedWindowMs, rule.delayMs) };
}

// Time left between the close of a speed window and the next draw, so the round end
// and classic prizes are decided before the next number (01 §5, D10).
const GAP_AFTER_WINDOW_MS = 1_000;

// Allowed timed-draw gap: the realtime range, but always longer than the speed window.
export function drawRange(speedWindowMs: number): { readonly min: number; readonly max: number } {
  const min = Math.max(REALTIME_DRAW_INTERVAL_MS.min, speedWindowMs + GAP_AFTER_WINDOW_MS);
  return { min, max: REALTIME_DRAW_INTERVAL_MS.max };
}

// The starter's draw gap, kept inside the allowed range (01 §5).
export function withinDrawRange(ms: number, speedWindowMs: number): number {
  const { min, max } = drawRange(speedWindowMs);
  return Math.min(max, Math.max(min, ms));
}

// Delay the server computes the owner's cards with: the chosen one, or the default
// under noAutoMark, because the owner's later taps are not known before playback.
export function delayOf(rule: MissedNumbers): number {
  return rule.kind === 'autoMarkAfter' ? rule.delayMs : DEFAULT_AUTO_MARK_DELAY_MS;
}
