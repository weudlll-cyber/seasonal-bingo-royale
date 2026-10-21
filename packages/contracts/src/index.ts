/**
 * @file   packages/contracts/src/index.ts
 * @module contracts
 * @brief  Public entry point of @sbr/contracts.
 *
 * Responsibility: Zod schemas and inferred types shared by server and clients. For WP-04
 *                 that is the ruleset document, the game-type enum and the classic prize
 *                 catalogue; later WPs add HTTP/WS envelopes and other config documents.
 * Depends on:     zod
 * Used by:        apps/server, apps/web, apps/admin, packages/application, packages/domain
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/01-game-design.md §3a, §4–§9
 */

export const PACKAGE_NAME = '@sbr/contracts';

export { GameTypeSchema, isClassic, type GameType } from './config/gameType.js';
export {
  BUILTIN_PRIZE_KEYS,
  BUILTIN_PRIZE_POINTS,
  BuiltinPrizeKeySchema,
  DEFAULT_PRIZE_SELECTION,
  PrizeListSchema,
  type BuiltinPrizeKey,
  type PrizeList,
} from './config/prizes.js';
export {
  REALTIME_DRAW_INTERVAL_MS,
  DEFAULT_AUTO_MARK_DELAY_MS,
  DEFAULT_ROUND_PAUSE_MS,
  MIN_ROUND_PAUSE_MS,
  shortestDrawIntervalMs,
  RulesetSchema,
  type Effect,
  type Ruleset,
} from './config/ruleset.js';
export {
  DEFAULT_RULESETS,
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleAsyncDefault,
  royaleRealtimeDefault,
  type NamedRuleset,
} from './config/defaults/index.js';
