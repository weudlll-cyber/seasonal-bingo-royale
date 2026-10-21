/**
 * @file   packages/domain/src/match/lifecycleTypes.ts
 * @module domain/match
 * @brief  The subset of a ruleset the match lifecycle depends on (01 §4–§9, §3a).
 *
 * Responsibility: the domain layer must not import @sbr/contracts; this file is the
 *                 trimmed value type the application and tests feed into decide/evolve.
 *                 Mirrors the structure of RulesetSchema in contracts/config but keeps
 *                 only what the engine needs. Both widen together: a new engine input
 *                 adds a key here and the application maps it from the contract.
 * Depends on:     ../seasons/effectCatalog (Effect union)
 * Used by:        ./matchState, ./decide, ./evolve, apps/server application layer
 * Spec:           docs/spec/01-game-design.md §3a, §4–§9 (§6 missed numbers)
 */
import type { Effect } from '../seasons/effectCatalog.js';
import type { SeasonName } from '../draw/pool.js';

export type MatchMode = 'realtime' | 'async';
export type MarkingMode = 'auto' | 'manual';

// What happens to a drawn number a tapping player has not marked (01 §6): it is marked
// for the player without bonus once delayMs has passed, or it stays open until tapped
// or until the round ends. Bots and players in auto marking mode always mark on the draw.
export type MissedNumbers =
  { readonly kind: 'autoMarkAfter'; readonly delayMs: number } | { readonly kind: 'noAutoMark' };

export type RoundEnd =
  | { readonly kind: 'drawCount'; readonly draws: number }
  | { readonly kind: 'firstBingo'; readonly graceDraws: number }
  | { readonly kind: 'bingoQuota'; readonly quotaPercent: number }
  | { readonly kind: 'firstFullHouse' };

export type CutRule =
  | { readonly keep: 'percent'; readonly value: number; readonly minSurvivors: number }
  | { readonly keep: 'count'; readonly value: number; readonly minSurvivors: number }
  | { readonly keep: 'scoreThreshold'; readonly value: number; readonly minSurvivors: number };

export type ScoreCarry =
  | { readonly kind: 'keep' }
  | { readonly kind: 'reset' }
  | { readonly kind: 'scaled'; readonly factor: number };

export type StageKind = 'qualification' | 'elimination' | 'final';

export interface StagePlanEntry {
  readonly kind: StageKind;
  readonly rounds: number;
  readonly roundEnd: RoundEnd;
  readonly cut?: CutRule;
  readonly scoreCarry: ScoreCarry;
  readonly stageMultiplier: number;
  readonly activePatterns: readonly string[];
}

export interface MatchRuleset {
  readonly mode: MatchMode;
  readonly markingMode: MarkingMode;
  readonly missedNumbers: MissedNumbers;
  readonly cardsPerPlayer: number;
  readonly freeCenter: boolean;
  readonly pointsPerMark: number;
  readonly firstToPatternBonusPercent: number;
  readonly pointsByPrizeKey: Readonly<Record<string, number>>;
  readonly seasons: Readonly<Record<SeasonName, { readonly effect: Effect }>>;
  readonly seasonComplete: { readonly points: number; readonly effect: Effect };
  readonly jackpot: { readonly base: number; readonly growthPerRound: number };
  readonly stages: readonly StagePlanEntry[];
}
