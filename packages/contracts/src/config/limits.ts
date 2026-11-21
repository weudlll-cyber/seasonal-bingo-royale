/**
 * @file   packages/contracts/src/config/limits.ts
 * @module contracts/config
 * @brief  The limits the server enforces on what a player or host types, sent to the client.
 *
 * Responsibility: one place for the bounds the server checks on a new match (title length,
 *                 player count, missed-number delay, round pause) and on an account (display
 *                 name and password lengths), the start countdown and the realtime draw
 *                 interval a form shows while its field is empty. The server validates with
 *                 these and sends them with the session answer (`limits`); the client reads
 *                 them from there and keeps no copy (admin-area §8 (m)), so a later setting
 *                 changes server and forms together.
 * Depends on:     zod, ./ruleset, ./defaults/roundPause, ./defaults/royaleRealtime
 * Used by:        ../index; apps/server (match input, accounts, session answer); apps/web (types)
 * Spec:           docs/concepts/admin-area.md §8 (m), §9 piece 0; docs/spec/05-api-design.md §2.1
 */
import { z } from 'zod';

import { MIN_ROUND_PAUSE_MS } from './defaults/roundPause.js';
import { royaleRealtimeDefault } from './defaults/royaleRealtime.js';
import { START_COUNTDOWN_MS } from './ruleset.js';

const RangeSchema = z.object({ min: z.number().int(), max: z.number().int() });

export const ClientLimitsSchema = z.object({
  // A match title, in characters.
  titleMaxLength: z.number().int(),
  // Players a match may hold (also the development bot fill).
  players: RangeSchema,
  // A display name and a password, in characters.
  displayName: RangeSchema,
  password: RangeSchema,
  // Milliseconds before a missed number is marked; the wait between royale rounds.
  missedDelayMs: RangeSchema,
  roundPauseMs: RangeSchema,
  // The countdown players see before the first round, and the realtime rulesets' interval
  // between draws (what a form names while its interval field is empty).
  startCountdownMs: z.number().int(),
  drawIntervalMs: z.number().int(),
});
export type ClientLimits = z.infer<typeof ClientLimitsSchema>;

export const LIMITS: ClientLimits = Object.freeze({
  titleMaxLength: 60,
  players: { min: 2, max: 200 },
  displayName: { min: 3, max: 24 },
  password: { min: 12, max: 128 },
  missedDelayMs: { min: 0, max: 60_000 },
  roundPauseMs: { min: MIN_ROUND_PAUSE_MS, max: 120_000 },
  startCountdownMs: START_COUNTDOWN_MS,
  drawIntervalMs: royaleRealtimeDefault.draws.intervalMsRealtime,
});
