/**
 * @file   apps/web/src/drawControl.ts
 * @module web
 * @brief  Quick Test draw control (D8): one draw per step, `auto` interval or `host` draws.
 *
 * Responsibility: pure rules for how far one draw advances the event stream (exactly one
 *                 draw plus every event that belongs to it, up to the next draw) and for
 *                 the draw control: `auto` draws after an interval the starter or host
 *                 sets, clamped to the ruleset's allowed range; `host` draws only on
 *                 "Draw next". The draw order is fixed by the seed; control only decides
 *                 when the next draw is shown. The speed window for manual taps always
 *                 starts when a draw is shown (./manualMarking).
 * Depends on:     ./types
 * Used by:        ./useDrawTicker, ./App, ./components/DrawControls
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import type { DomainEventLike, QuickTestResult } from './types.js';

export type DrawMode = 'auto' | 'host';

export interface DrawControl {
  readonly mode: DrawMode;
  // Seconds between `auto` draws; null means the ruleset interval.
  readonly intervalSec: number | null;
  // "Skip to end" was pressed: show the whole match at once.
  readonly skipped: boolean;
}

export const INITIAL_CONTROL: DrawControl = { mode: 'auto', intervalSec: null, skipped: false };

// Where playback starts: everything before the first draw (lobby, stage, round, cards),
// so the owner sees the card before draw 1.
export function firstStep(events: readonly DomainEventLike[]): number {
  const first = events.findIndex((e) => e.type === 'drawMade');
  return first < 0 ? events.length : first;
}

// One draw: reveal the next draw and all events up to the following draw (marks,
// prizes, effects, round end, cut, next stage and round), or to the end of the stream.
export function nextStep(events: readonly DomainEventLike[], step: number): number {
  const draw = events.findIndex((e, i) => i >= step && e.type === 'drawMade');
  if (draw < 0) return events.length;
  const following = events.findIndex((e, i) => i > draw && e.type === 'drawMade');
  return following < 0 ? events.length : following;
}

// Milliseconds between `auto` draws: the chosen seconds (or the ruleset interval),
// kept inside the ruleset's allowed range.
export function autoIntervalMs(control: DrawControl, result: QuickTestResult): number {
  const wanted = control.intervalSec === null ? result.drawIntervalMs : control.intervalSec * 1000;
  const { min, max } = result.drawIntervalRangeMs;
  return Math.min(max, Math.max(min, Math.round(wanted)));
}
