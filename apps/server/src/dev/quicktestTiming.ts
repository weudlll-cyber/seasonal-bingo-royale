/**
 * @file   apps/server/src/dev/quicktestTiming.ts
 * @module server/dev
 * @brief  Quick Test timing inputs: missed-number rule, owner delay, draw gap (01 §5, §6).
 *
 * Responsibility: turn the starter's choices into the values the runner simulates with:
 *                 the missed-number rule with its delay raised to at least the speed
 *                 window, the delay the owner's cards are computed with (the owner's
 *                 later taps are not known before playback, so noAutoMark uses the
 *                 default delay), and the timed-draw gap kept inside the allowed range.
 * Depends on:     @sbr/contracts, @sbr/domain (types)
 * Used by:        ./quicktest
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

// The starter's draw gap, kept inside the allowed realtime range (01 §5).
export function withinDrawRange(ms: number): number {
  return Math.min(REALTIME_DRAW_INTERVAL_MS.max, Math.max(REALTIME_DRAW_INTERVAL_MS.min, ms));
}

// Delay the server computes the owner's cards with: the chosen one, or the default
// under noAutoMark, because the owner's later taps are not known before playback.
export function delayOf(rule: MissedNumbers): number {
  return rule.kind === 'autoMarkAfter' ? rule.delayMs : DEFAULT_AUTO_MARK_DELAY_MS;
}
