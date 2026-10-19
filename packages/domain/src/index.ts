/**
 * @file   packages/domain/src/index.ts
 * @module domain
 * @brief  Public entry point of @sbr/domain. Pure game rules; no I/O, no clock.
 *
 * Responsibility: expose the WP-05 pieces — DRBG, draw sequence, card generation,
 *                 pattern detection and the seed commitment. Later WPs add scoring,
 *                 seasons, royale structure and the match state machine.
 * Depends on:     node:crypto only (through ./draw/drbg and ./commitment)
 * Used by:        packages/application, apps/server
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/01-game-design.md §4, §5, §9
 */

export const PACKAGE_NAME = '@sbr/domain';

export { type GameType, isClassic } from './gameType.js';
export { createDrbg, SEED_BYTES, type Drbg } from './draw/drbg.js';
export {
  NUMBER_MIN,
  NUMBER_MAX,
  SEASON_NAMES,
  SYMBOL_IDS,
  isNumber,
  isSymbol,
  poolItems,
  poolSize,
  type SeasonName,
  type SymbolId,
} from './draw/pool.js';
export { drawSequence, type DrawSequenceInput } from './draw/drawSequence.js';
export {
  CARD_SIZE,
  CELL_COUNT,
  CENTRE_INDEX,
  columnOf,
  rowOf,
  type Card,
  type Cell,
} from './card/cardTypes.js';
export { generateCard, type GenerateCardInput } from './card/generateCard.js';
export {
  CORNERS_MASK,
  COLUMN_MASKS,
  DIAGONAL_MASKS,
  FULL_MASK,
  ROW_MASKS,
  completedPrizeKeys,
  completedPrizes,
  type CompletedPrizes,
  type Mark,
  type MarkMask,
} from './card/patterns.js';
export { commitSeed, verifyCommitment } from './commitment.js';
