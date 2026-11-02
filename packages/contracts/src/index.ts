/**
 * @file   packages/contracts/src/index.ts
 * @module contracts
 * @brief  Public entry point of @sbr/contracts.
 *
 * Responsibility: Zod schemas and inferred types shared by server and clients: the
 *                 ruleset document and its defaults, the game-type enum, the classic prize
 *                 catalogue, the leaderboard defaults, the view the player client folds
 *                 (Quick Test and live match), the "While you were away" summary, the
 *                 async catch-up defaults and the leaderboard, profile and export
 *                 answers; later WPs add WS envelopes and other config documents.
 * Depends on:     ./config/*, ./config/defaults/*, ./view/*, ./http/*
 * Used by:        apps/server, apps/web, packages/application, e2e/quickTest
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/01-game-design.md §3a, §4–§9
 */

export { type GameType } from './config/gameType.js';
export {
  BUILTIN_PRIZE_KEYS,
  BUILTIN_PRIZE_POINTS,
  DEFAULT_PRIZE_SELECTION,
  MAX_PRIZES,
  PRIZE_KEY_MAX_LENGTH,
  PrizeKeySchema,
  PrizeListSchema,
} from './config/prizes.js';
export {
  ASYNC_DRAW_INTERVAL_MS,
  REALTIME_DRAW_INTERVAL_MS,
  DEFAULT_AUTO_MARK_DELAY_MS,
  START_COUNTDOWN_MS,
  MIN_START_AHEAD_MS,
  MAX_START_AHEAD_MS,
  shortestDrawIntervalMs,
  QuietHoursSchema,
  RulesetSchema,
  type QuietHours,
  type Effect,
  type Ruleset,
} from './config/ruleset.js';
export {
  DEFAULT_RULESETS,
  LEADERBOARD_DEFAULTS,
  type LeaderboardConfig,
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleAsyncDefault,
  royaleRealtimeDefault,
} from './config/defaults/index.js';
export { DEFAULT_ROUND_PAUSE_MS, MIN_ROUND_PAUSE_MS } from './config/defaults/roundPause.js';
export { ASYNC_CATCH_UP } from './config/defaults/asyncCatchUp.js';
export {
  SEASON_NAMES,
  type Card,
  type Cell,
  type CompactCard,
  type CutFacts,
  type DomainEventLike,
  type EffectKind,
  type MarkingMode,
  type MissedNumbers,
  type OwnerStatus,
  type PlayerSummary,
  type QuickTestResult,
  type RoundEndRule,
  type Season,
  type StagePlanEntry,
  type WatchView,
} from './view/clientView.js';
export { type MatchVerificationView, type RoundVerification } from './view/verification.js';
export { type RecapScorer, type RoundRecap } from './view/roundRecap.js';
export { type AwaySummary } from './view/awaySummary.js';
export type {
  AccountExport,
  LeaderboardAround,
  LeaderboardPage,
  LeaderboardPeriod,
  LeaderboardPeriods,
  LeaderboardRow,
  LeagueOutcome,
  PlayerProfile,
  ProfileBadge,
  ProfileMatch,
} from './http/leaderboard.js';
