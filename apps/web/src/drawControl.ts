/**
 * @file   apps/web/src/drawControl.ts
 * @module web
 * @brief  Quick Test draw control (D8): one draw per step, `auto` interval or `host` draws.
 *
 * Responsibility: pure rules for how far one draw advances the event stream (the draw plus every
 *                 event of it up to the close of its speed window, then what that close decides,
 *                 up to the next draw, stage or round) and for the draw control: `auto` draws
 *                 after an interval the starter or host sets, clamped to the ruleset's range;
 *                 `host` draws only on "Draw next". The seed fixes the draw order; control only
 *                 decides when the next draw shows. The speed window for manual taps always
 *                 starts when a draw is shown (./manualMarking).
 * Depends on:     ./types
 * Used by:        ./useDrawTicker, ./App, ./components/DrawControls,
 *                 ./components/DrawModeSwitch, ./components/StartDrawField,
 *                 ./components/StartForm, ./host/createForm
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

// Events that open the next step: a draw, the close of its speed window, or a new stage
// or round.
const STEP_START = new Set(['drawMade', 'speedWindowClosed', 'stageStarted', 'roundStarted']);

// Playback is waiting for the speed window of the shown draw to close.
export function windowPending(events: readonly DomainEventLike[], step: number): boolean {
  return events[step]?.type === 'speedWindowClosed';
}

// One step. A draw step reveals the next draw with its marks and effects, up to the
// close of its speed window. A window step (when one is pending) reveals what that close
// decides — classic prizes, round end, cut — up to the next draw or the next stage or
// round. So a round's last number stays tappable for its whole window (01 §5, D10) and
// the next round's cards come with its first draw.
export function nextStep(events: readonly DomainEventLike[], step: number): number {
  const start = windowPending(events, step)
    ? step
    : events.findIndex((e, i) => i >= step && e.type === 'drawMade');
  if (start < 0) return events.length;
  const following = events.findIndex((e, i) => i > start && STEP_START.has(e.type));
  return following < 0 ? events.length : following;
}

// Milliseconds between `auto` draws: the chosen seconds (or the ruleset interval),
// kept inside the ruleset's allowed range.
export function autoIntervalMs(control: DrawControl, result: QuickTestResult): number {
  const wanted = control.intervalSec === null ? result.drawIntervalMs : control.intervalSec * 1000;
  const { min, max } = result.drawIntervalRangeMs;
  return Math.min(max, Math.max(min, Math.round(wanted)));
}
