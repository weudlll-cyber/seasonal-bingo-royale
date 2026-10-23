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
 *                 which starts 1 s after the longest tap time (D10, D12).
 * Depends on:     @sbr/contracts, @sbr/domain (types)
 * Used by:        ./engine, apps/server/src/dev/quicktest.ts, ../index, ./create
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import {
  DEFAULT_AUTO_MARK_DELAY_MS,
  REALTIME_DRAW_INTERVAL_MS,
  shortestDrawIntervalMs,
} from '@sbr/contracts';
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

// Allowed timed-draw gap: from 1 s after the match's longest tap time (D12; so the round
// end and classic prizes are decided before the next number, D10) to the realtime max.
export function drawRange(
  speedWindowMs: number,
  missed: MissedNumbers,
): { readonly min: number; readonly max: number } {
  const delay = missed.kind === 'autoMarkAfter' ? missed.delayMs : null;
  return { min: shortestDrawIntervalMs(speedWindowMs, delay), max: REALTIME_DRAW_INTERVAL_MS.max };
}

// The starter's or host's draw gap, kept inside the allowed range (01 §5, D12).
export function withinDrawRange(ms: number, speedWindowMs: number, missed: MissedNumbers): number {
  const { min, max } = drawRange(speedWindowMs, missed);
  return Math.min(max, Math.max(min, ms));
}

// Delay the server computes the owner's cards with: the chosen one, or the default
// under noAutoMark, because the owner's later taps are not known before playback.
export function delayOf(rule: MissedNumbers): number {
  return rule.kind === 'autoMarkAfter' ? rule.delayMs : DEFAULT_AUTO_MARK_DELAY_MS;
}
