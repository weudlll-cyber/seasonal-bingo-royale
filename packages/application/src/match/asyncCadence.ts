/**
 * @file   packages/application/src/match/asyncCadence.ts
 * @module application/match
 * @brief  When the timed draws of an asynchronous match are due: cadence, quiet hours, catch-up.
 *
 * Responsibility: the first timed draw of a round (one interval away) and each next one
 *                 (one interval after the draw's planned time), moved out of the quiet hours
 *                 (01 §5). The planned time travels with the scheduled actions, so after
 *                 downtime the missed draws are made in order at the catch-up pace, at most
 *                 the cap of them, never inside quiet hours, and then the cadence resumes
 *                 (06 §6); whether the match is inside its quiet hours now. Realtime matches
 *                 have no cadence here. Pure.
 * Depends on:     @sbr/contracts (types), ./ports (types), ./quietHours
 * Used by:        ./flow, ./engine, ../index
 * Spec:           docs/spec/01-game-design.md §5; docs/spec/06-realtime-architecture.md §6
 */
import type { QuietHours } from '@sbr/contracts';

import type { MatchRecord } from './ports.js';
import { outsideQuietHours, quietHoursEnd } from './quietHours.js';

export interface Cadence {
  readonly intervalMs: number;
  readonly quietHours: QuietHours | null;
  readonly timeZone: string;
}

interface NextDrawInput {
  // When the draw just made was planned; it may have run later (downtime).
  readonly plannedAt: number;
  readonly drawnAt: number;
  readonly now: number;
  readonly cadence: Cadence;
  readonly catchUp: { readonly intervalMs: number; readonly maxDraws: number };
}

interface TimedDraw {
  readonly dueAt: number;
  readonly plannedAt: number;
}

// The cadence of an asynchronous match; null for a realtime one.
export function cadenceOf(record: MatchRecord): Cadence | null {
  if (record.ruleset.mode !== 'async') return null;
  const s = record.settings;
  return { intervalMs: s.drawIntervalMs, quietHours: s.quietHours, timeZone: s.timeZone };
}

// When the quiet hours the match is in right now end; null outside them (or without).
export function quietUntil(record: MatchRecord, now: number): number | null {
  const c = cadenceOf(record);
  if (c === null || c.quietHours === null) return null;
  return quietHoursEnd(now, c.quietHours, c.timeZone);
}

const outside = (at: number, c: Cadence): number => outsideQuietHours(at, c.quietHours, c.timeZone);

// A round's first timed draw (or the first after switching to timed draws).
export function firstAsyncDraw(now: number, cadence: Cadence): number {
  return outside(now + cadence.intervalMs, cadence);
}

// The next timed draw after one planned at `plannedAt`. Behind schedule it comes at the
// catch-up pace (the caller's window close keeps it after the previous draw's window, D10);
// draws missed beyond the cap are dropped by moving the planned time forward.
export function nextAsyncDraw(input: NextDrawInput): TimedDraw {
  const { cadence, catchUp, now } = input;
  const planned = outside(input.plannedAt + cadence.intervalMs, cadence);
  if (planned > now) return { dueAt: planned, plannedAt: planned };
  const oldestKept = now - catchUp.maxDraws * cadence.intervalMs;
  const dueAt = outside(Math.max(now, input.drawnAt + catchUp.intervalMs), cadence);
  return { dueAt, plannedAt: Math.max(planned, oldestKept) };
}
