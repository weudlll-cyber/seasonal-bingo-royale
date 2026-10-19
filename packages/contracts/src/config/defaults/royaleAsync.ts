/**
 * @file   packages/contracts/src/config/defaults/royaleAsync.ts
 * @module contracts/config/defaults
 * @brief  Default published ruleset "royale-async": the royale on a slow cadence (01 §11).
 *
 * Responsibility: identical stages and seasons as the realtime default; only the draw
 *                 cadence, marking mode and lobby window change (01 §11). Everything else
 *                 lives in ./common.
 * Depends on:     ../ruleset, ./common
 * Used by:        apps/server seed
 * Spec:           docs/spec/01-game-design.md §11
 */
import { RulesetSchema, type Ruleset } from '../ruleset.js';
import {
  DEFAULT_GENERAL,
  DEFAULT_LOBBY_SHAPE,
  DEFAULT_SCORING,
  DEFAULT_SEASONS,
} from './common.js';

export const royaleAsyncDefault: Ruleset = RulesetSchema.parse({
  gameType: 'royale',
  mode: 'async',
  countsForLeaderboard: true,
  general: { ...DEFAULT_GENERAL },
  draws: {
    intervalMsRealtime: 5_000,
    intervalMsAsync: 15 * 60_000,
    quietHours: { startHour: 0, endHour: 7 },
  },
  marking: { mode: 'auto', speedWindowMs: 3_000 },
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
