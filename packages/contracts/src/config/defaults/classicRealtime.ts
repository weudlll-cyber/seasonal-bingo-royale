/**
 * @file   packages/contracts/src/config/defaults/classicRealtime.ts
 * @module contracts/config/defaults
 * @brief  Default published ruleset "classic-realtime": one plain 75-ball round.
 *
 * Responsibility: `classic` game type on a realtime 5-second cadence. Same ticked
 *                 prize set as classicSeasons; no season symbols in the pool (WP-05
 *                 enforces the game-type-specific pool).
 * Depends on:     ../ruleset, ./common, ../prizes
 * Used by:        apps/server seed, ./index
 * Spec:           docs/spec/01-game-design.md §3a
 */
import { DEFAULT_PRIZE_SELECTION } from '../prizes.js';
import { RulesetSchema, type Ruleset } from '../ruleset.js';
import {
  DEFAULT_GENERAL,
  DEFAULT_LOBBY_SHAPE,
  DEFAULT_SCORING,
  DEFAULT_SEASONS,
} from './common.js';

export const classicRealtimeDefault: Ruleset = RulesetSchema.parse({
  gameType: 'classic',
  mode: 'realtime',
  countsForLeaderboard: false,
  general: { ...DEFAULT_GENERAL },
  draws: {
    intervalMsRealtime: 5_000,
    intervalMsAsync: 15 * 60_000,
    quietHours: null,
  },
  marking: { mode: 'manual', speedWindowMs: 3_000 },
  scoring: { ...DEFAULT_SCORING },
  seasons: { ...DEFAULT_SEASONS },
  lobby: {
    ...DEFAULT_LOBBY_SHAPE,
    openMsRealtime: 10 * 60_000,
    openMsAsync: 24 * 60 * 60_000,
  },
  defaultPrizes: [...DEFAULT_PRIZE_SELECTION],
});
