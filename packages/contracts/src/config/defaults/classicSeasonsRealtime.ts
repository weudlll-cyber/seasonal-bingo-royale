/**
 * @file   packages/contracts/src/config/defaults/classicSeasonsRealtime.ts
 * @module contracts/config/defaults
 * @brief  Default published ruleset "classic-seasons-realtime": one classic round plus symbols.
 *
 * Responsibility: `classicSeasons` game type on a realtime 5-second cadence. No stages,
 *                 no jackpot, no Season Complete bonus (01 §3a). `defaultPrizes` carries
 *                 the owner-decided ticked set (01 §3a.1).
 * Depends on:     ../ruleset, ./common, ../prizes
 * Used by:        apps/server seed
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

export const classicSeasonsRealtimeDefault: Ruleset = RulesetSchema.parse({
  gameType: 'classicSeasons',
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
  // Season effects stay in the schema (admins may add bonuses later), but the
  // classic flow of WP-07 is going to ignore them per 01 §3a.
  seasons: { ...DEFAULT_SEASONS },
  lobby: {
    ...DEFAULT_LOBBY_SHAPE,
    openMsRealtime: 10 * 60_000,
    openMsAsync: 24 * 60 * 60_000,
  },
  defaultPrizes: [...DEFAULT_PRIZE_SELECTION],
});
