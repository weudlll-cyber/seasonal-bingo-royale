/**
 * @file   packages/contracts/src/config/defaults/royaleRealtime.ts
 * @module contracts/config/defaults
 * @brief  Default published ruleset "royale-realtime": a 100-player royale on a 5-second cadence.
 *
 * Responsibility: the ruleset the install script publishes as version 1 for the realtime
 *                 royale game type (01 §7, §11; 04 §6). Admins clone it to build their own.
 * Depends on:     ../ruleset, ./common
 * Used by:        apps/server seed, admin ruleset library
 * Spec:           docs/spec/01-game-design.md §7, §11, docs/spec/04-database-design.md §6
 */
import { RulesetSchema, type Ruleset } from '../ruleset.js';
import {
  DEFAULT_GENERAL,
  DEFAULT_LOBBY_SHAPE,
  DEFAULT_SCORING,
  DEFAULT_SEASONS,
} from './common.js';

export const royaleRealtimeDefault: Ruleset = RulesetSchema.parse({
  gameType: 'royale',
  mode: 'realtime',
  countsForLeaderboard: true,
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
  stages: [
    {
      kind: 'qualification',
      rounds: 2,
      roundEnd: { kind: 'drawCount', draws: 40 },
      cut: { keep: 'percent', value: 50, minSurvivors: 2 },
      scoreCarry: { kind: 'keep' },
      stageMultiplier: 1,
      activePatterns: ['rows-1', 'columns-1', 'oneDiagonal', 'fourCorners'],
    },
    {
      kind: 'elimination',
      rounds: 2,
      roundEnd: { kind: 'drawCount', draws: 35 },
      cut: { keep: 'percent', value: 50, minSurvivors: 2 },
      scoreCarry: { kind: 'keep' },
      stageMultiplier: 1.25,
      activePatterns: ['rows-1', 'columns-1', 'oneDiagonal', 'bothDiagonals', 'fourCorners'],
    },
    {
      kind: 'final',
      rounds: 1,
      roundEnd: { kind: 'firstFullHouse' },
      scoreCarry: { kind: 'reset' },
      stageMultiplier: 2,
      activePatterns: ['fullCard'],
    },
  ],
  jackpot: { base: 1_000, growthPerRound: 250, rollover: false },
  seasonComplete: { points: 300, effect: { type: 'none' } },
});
