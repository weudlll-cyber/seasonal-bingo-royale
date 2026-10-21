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
export { scoreMark, type MarkScoring } from './scoring/basePoints.js';
export { speedBonus, type SpeedBonusCfg } from './scoring/speedBonus.js';
export {
  scorePattern,
  type PatternScoringCfg,
  type PatternScoreInput,
} from './scoring/patternScoring.js';
export {
  INITIAL_EFFECT_STATE,
  hasActivatedAllSeasons,
  markSeasonActivated,
  type EffectState,
  type GrowthState,
  type MultiplierState,
  type SeasonsBitmask,
} from './seasons/effectState.js';
export { type Effect, type EffectType } from './seasons/effectCatalog.js';
export { applyEffect, type ApplyEffectResult, type HarvestContext } from './seasons/applyEffect.js';
export { consumeShield, onDraw, onMarkInsideGrowth } from './seasons/tickEffects.js';
export {
  checkSeasonComplete,
  type SeasonCompleteCfg,
  type SeasonCompleteResult,
} from './seasons/seasonComplete.js';
export { finalRanking, type Placement, type RankedPlayer } from './royale/finalRanking.js';
export { applyCut, type Candidate, type CutResult, type CutRule } from './royale/cut.js';
export {
  canClaim,
  jackpotValue,
  type JackpotCfg,
  type JackpotClaimInput,
} from './royale/jackpot.js';
export {
  classicPlacement,
  type ClassicPlacement,
  type ClassicPlayer,
  type PrizeAward,
} from './classic/classicPlacement.js';
export { BUILTIN_PRIZE_CATALOGUE_ORDER } from './classic/prizeCatalogue.js';
export type {
  MatchRuleset,
  MatchMode,
  MarkingMode,
  MissedNumbers,
  RoundEnd,
  CutRule as RulesetCutRule,
  ScoreCarry,
  StagePlanEntry,
  StageKind,
} from './match/lifecycleTypes.js';
export type {
  MatchState,
  PlayerState,
  RoundState,
  CardMarks,
  ClassicAward,
  MatchPhase,
} from './match/matchState.js';
export type {
  Command,
  OpenLobby,
  JoinMatch,
  StartMatch,
  StartStage,
  StartRound,
  DrawNext,
  MarkCell,
  AutoMarkMissed,
  CloseSpeedWindow,
  EndRound,
  ApplyCut,
  FinishMatch,
  AbortMatch,
} from './match/commands.js';
export type {
  DomainEvent,
  LobbyOpened,
  PlayerJoined,
  MatchStarted,
  StageStarted,
  RoundStarted,
  DrawMade,
  SpeedWindowClosed,
  CellMarked,
  SeasonActivated,
  PatternScored,
  SeasonCompleteFired,
  JackpotClaimed,
  ClassicPrizeAwarded,
  RoundEnded,
  CutApplied,
  MatchFinished,
  MatchAborted,
} from './match/events.js';
export { decide, type DecideCtx } from './match/decide.js';
export { evolve, createInitialMatchState } from './match/evolve.js';
export { buildStagePlan } from './match/stagePlan.js';
export { royaleEndReason, classicEndReason } from './match/roundEnd.js';
export { buildMarkEvents, type MarkInput } from './match/markResolver.js';
export {
  simulateMatch,
  type SimulateMatchInput,
  type SimulateMatchResult,
} from './match/simulate.js';
