/**
 * @file   packages/domain/src/index.ts
 * @module domain
 * @brief  Public entry point of @sbr/domain. Pure game rules; no I/O, no clock.
 *
 * Responsibility: expose the WP-05 pieces — DRBG, draw sequence, card generation,
 *                 pattern detection and the seed commitment. Later WPs add scoring,
 *                 seasons, royale structure and the match state machine.
 * Depends on:     node:crypto only (through ./draw/drbg and ./commitment), ./card/cardTypes,
 *                 ./card/generateCard, ./card/patterns, ./classic/classicPlacement,
 *                 ./classic/prizeCatalogue, ./draw/drawSequence, ./draw/pool, ./gameType,
 *                 ./match/commands, ./match/decide, ./match/decideRanking, ./match/events,
 *                 ./match/evolve, ./match/flow, ./match/lifecycleTypes, ./match/markResolver,
 *                 ./match/matchState, ./match/simulate, ./royale/cut, ./royale/finalRanking,
 *                 ./royale/jackpot, ./royale/tieBreak, ./scoring/basePoints, ./scoring/patternScoring,
 *                 ./scoring/speedBonus, ./seasons/applyEffect, ./seasons/effectCatalog,
 *                 ./seasons/effectState, ./seasons/seasonComplete, ./seasons/tickEffects,
 *                 ./verifyMatch
 * Used by:        packages/application, apps/server, ./card/card.properties.test,
 *                 ./card/card.test, ./classic/classic.test, ./commitment.test,
 *                 ./draw/draw.properties.test, ./draw/draw.test, ./match/classicFlow.test,
 *                 ./match/lastNumber.test, ./match/lifecycle.test,
 *                 ./match/match.properties.test, ./match/match.test,
 *                 ./match/missedNumbers.test, ./royale/royale.properties.test,
 *                 ./royale/royale.test, ./scoring/scoring.test,
 *                 ./seasons/effects.properties.test, ./seasons/seasons.test, ./verifyMatch.test,
 *                 ../test/arbitraries, ../test/builders, ../test/drive
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/01-game-design.md §4, §5, §9
 */

export { type GameType } from './gameType.js';
export { createDrbg, SEED_BYTES, type Drbg } from './draw/drbg.js';
export {
  NUMBER_MIN,
  NUMBER_MAX,
  SEASON_NAMES,
  SYMBOL_IDS,
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
  completedPrizeKeys,
  completedPrizes,
  type CompletedPrizes,
  type Mark,
  type MarkMask,
} from './card/patterns.js';
export { commitSeed, verifyCommitment } from './commitment.js';
export {
  verifyMatch,
  type MatchVerification,
  type RoundCheck,
  type VerifyMatchInput,
} from './verifyMatch.js';
export { scoreMark, type MarkScoring } from './scoring/basePoints.js';
export { speedBonus, type SpeedBonusCfg } from './scoring/speedBonus.js';
export {
  scorePattern,
  type PatternScoringCfg,
  type PatternScoreInput,
} from './scoring/patternScoring.js';
export {
  INITIAL_EFFECT_STATE,
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
export { byTieBreak, type TieBreakScore } from './royale/tieBreak.js';
export { jackpotValue, type JackpotCfg } from './royale/jackpot.js';
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
export { candidateOf, countBits } from './match/decideRanking.js';
export { type MarkInput } from './match/markResolver.js';
export {
  simulateMatch,
  type SimulateMatchInput,
  type SimulateMatchResult,
} from './match/simulate.js';
export { nextStep, type NextStep } from './match/flow.js';
