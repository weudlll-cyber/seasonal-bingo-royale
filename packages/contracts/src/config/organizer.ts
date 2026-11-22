/**
 * @file   packages/contracts/src/config/organizer.ts
 * @module contracts/config
 * @brief  A preset's part for the Organizer: what the "Start a match" page offers and allows.
 *
 * Responsibility: per preset (admin-area §3, §4 "the Organizer's limits"): one line saying what
 *                 is special about it, the players a match may have (a range and the value the
 *                 page starts at), the three speeds in words (relaxed, normal, quick: draw
 *                 intervals, §8 (h)) and which starts the Organizer may choose (now, at a time,
 *                 when full). `organizerDefaults(ruleset)` is the part a preset gets when it
 *                 has none yet: today's host form (2 to 200 players, 20 to start with, every
 *                 start) and the ruleset's interval as "normal".
 * Depends on:     zod, ./limits, ./ruleset
 * Used by:        ../index; ./presetFields; apps/server (presets, match creation), apps/web
 * Spec:           docs/concepts/admin-area.md §3, §4 (Presets), §8 (g), (h), §9 piece 4
 */
import { z } from 'zod';

import { LIMITS } from './limits.js';
import {
  ASYNC_DRAW_INTERVAL_MS,
  REALTIME_DRAW_INTERVAL_MS,
  shortestDrawIntervalMs,
  type Ruleset,
} from './ruleset.js';

const players = z.number().int().min(LIMITS.players.min).max(LIMITS.players.max);
// Either mode's range; the preset's own mode narrows it (`speedProblem`).
const speed = z.number().int().min(REALTIME_DRAW_INTERVAL_MS.min).max(ASYNC_DRAW_INTERVAL_MS.max);

export const SPEEDS = ['relaxed', 'normal', 'quick'] as const;
export type Speed = (typeof SPEEDS)[number];

export const OrganizerSchema = z
  .strictObject({
    description: z.string().trim().max(120),
    players: z.strictObject({ min: players, max: players, start: players }),
    speedsMs: z.strictObject({ relaxed: speed, normal: speed, quick: speed }),
    starts: z.strictObject({ now: z.boolean(), at: z.boolean(), whenFull: z.boolean() }),
  })
  .refine((o) => o.players.min <= o.players.start && o.players.start <= o.players.max)
  .refine((o) => o.starts.now || o.starts.at || o.starts.whenFull);
export type Organizer = z.infer<typeof OrganizerSchema>;

const round = (ms: number, step: number): number => Math.round(ms / step) * step;

export function organizerDefaults(ruleset: Ruleset): Organizer {
  const normal =
    ruleset.mode === 'async' ? ruleset.draws.intervalMsAsync : ruleset.draws.intervalMsRealtime;
  const live = ruleset.mode === 'realtime';
  // Realtime: quick one second faster, never below the shortest interval (D12); relaxed half
  // as slow again. Asynchronous: a third and twice the interval, in whole minutes.
  const quick = live
    ? Math.max(shortestDrawIntervalMs(ruleset.marking.speedWindowMs, null), normal - 1_000)
    : Math.max(ASYNC_DRAW_INTERVAL_MS.min, round(normal / 3, 60_000));
  const relaxed = live
    ? Math.min(REALTIME_DRAW_INTERVAL_MS.max, round(normal * 1.5, 1_000))
    : Math.min(ASYNC_DRAW_INTERVAL_MS.max, normal * 2);
  return {
    description: '',
    players: { min: LIMITS.players.min, max: LIMITS.players.max, start: 20 },
    speedsMs: { relaxed, normal, quick },
    starts: { now: true, at: true, whenFull: true },
  };
}

// The speeds a preset may set: its mode's draw interval range, live ones at least the
// shortest interval (01 §5, D12).
export function speedRange(ruleset: Ruleset): { readonly min: number; readonly max: number } {
  if (ruleset.mode === 'async') return ASYNC_DRAW_INTERVAL_MS;
  const shortest = shortestDrawIntervalMs(ruleset.marking.speedWindowMs, null);
  return { min: shortest, max: REALTIME_DRAW_INTERVAL_MS.max };
}

// Why a speed does not fit the preset's mode, or null.
export function speedProblem(ruleset: Ruleset, ms: number): string | null {
  const range = speedRange(ruleset);
  return ms < range.min || ms > range.max ? 'outside the draw interval range of the mode' : null;
}
