/**
 * @file   apps/web/src/drawPace.ts
 * @module web
 * @brief  Quick Test playback pace: one draw per tick at the ruleset's draw interval.
 *
 * Responsibility: pure rules for how far one tick advances the event stream (exactly one
 *                 draw plus every event that belongs to it, up to the next draw) and how
 *                 long a tick lasts per pace (realtime = the ruleset's draw interval,
 *                 slower ×2, faster ÷4). The speed window for manual taps is not paced
 *                 here; it always starts when a draw is shown (./manualMarking).
 * Depends on:     ./types
 * Used by:        ./useDrawTicker
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import type { DomainEventLike } from './types.js';

export type PaceLabel = 'slower' | 'realtime' | 'faster' | 'skip';

// Where playback starts: everything before the first draw (lobby, stage, round, cards),
// so the owner sees the card before draw 1.
export function firstStep(events: readonly DomainEventLike[]): number {
  const first = events.findIndex((e) => e.type === 'drawMade');
  return first < 0 ? events.length : first;
}

// One tick: reveal the next draw and all events up to the following draw (marks,
// prizes, effects, round end, cut, next stage and round), or to the end of the stream.
export function nextStep(events: readonly DomainEventLike[], step: number): number {
  const draw = events.findIndex((e, i) => i >= step && e.type === 'drawMade');
  if (draw < 0) return events.length;
  const following = events.findIndex((e, i) => i > draw && e.type === 'drawMade');
  return following < 0 ? events.length : following;
}

// Milliseconds between two draws for a pace; `skip` jumps to the end at once.
export function paceIntervalMs(pace: Exclude<PaceLabel, 'skip'>, drawIntervalMs: number): number {
  if (pace === 'slower') return drawIntervalMs * 2;
  if (pace === 'faster') return Math.round(drawIntervalMs / 4);
  return drawIntervalMs;
}
