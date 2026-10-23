/**
 * @file   packages/contracts/src/index.ts
 * @module contracts
 * @brief  Public entry point of @sbr/contracts.
 *
 * Responsibility: Zod schemas and inferred types shared by server and clients: the
 *                 ruleset document and its defaults, the game-type enum, the classic prize
 *                 catalogue, and the view the player client folds (Quick Test and live
 *                 match); later WPs add HTTP/WS envelopes and other config documents.
 * Depends on:     zod, ./config/*, ./view/*, ./config/defaults/index
 * Used by:        apps/server, apps/web, apps/admin, packages/application, packages/domain,
 *                 ./config/ruleset.test
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/01-game-design.md §3a, §4–§9
 */

export { type GameType } from './config/gameType.js';
export {
  BUILTIN_PRIZE_KEYS,
  BUILTIN_PRIZE_POINTS,
  DEFAULT_PRIZE_SELECTION,
} from './config/prizes.js';
export {
  REALTIME_DRAW_INTERVAL_MS,
  DEFAULT_AUTO_MARK_DELAY_MS,
  DEFAULT_ROUND_PAUSE_MS,
  MIN_ROUND_PAUSE_MS,
  START_COUNTDOWN_MS,
  MAX_START_AHEAD_MS,
  shortestDrawIntervalMs,
  RulesetSchema,
  type Ruleset,
} from './config/ruleset.js';
export {
  DEFAULT_RULESETS,
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleAsyncDefault,
  royaleRealtimeDefault,
} from './config/defaults/index.js';
export {
  SEASON_NAMES,
  type Card,
  type Cell,
  type DomainEventLike,
  type EffectKind,
  type MarkingMode,
  type MissedNumbers,
  type OwnerStatus,
  type PlayerSummary,
  type QuickTestResult,
  type Season,
  type StagePlanEntry,
} from './view/clientView.js';
