/**
 * @file   packages/domain/src/match/matchState.ts
 * @module domain/match
 * @brief  State types for the match lifecycle (02 §5.1, 01 §3a, §7).
 *
 * Responsibility: the full in-memory state the match aggregate is projected into. One
 *                 shape serves royale and the two classic types; classic matches run a
 *                 single round without stages and without a jackpot. Pure data — no
 *                 behaviour. State transitions live in ./evolve.ts.
 * Depends on:     ../card/cardTypes, ../seasons/effectState, ../gameType, ./lifecycleTypes
 * Used by:        ./decide, ./evolve, ./simulate, apps/server match orchestration
 * Spec:           docs/spec/01-game-design.md §3, §3a, §7, §8; docs/spec/02-software-architecture.md §5.1
 */
import type { Card } from '../card/cardTypes.js';
import type { GameType } from '../gameType.js';
import type { EffectState } from '../seasons/effectState.js';
import type { MatchRuleset, StagePlanEntry } from './lifecycleTypes.js';

export type MatchPhase = 'lobby' | 'running' | 'finished' | 'aborted';

export interface PlayerState {
  readonly accountId: string;
  readonly joinedAt: number;
  readonly points: number;
  readonly patternsCount: number;
  readonly lastScoringDraw: number | null;
  readonly effects: EffectState;
  readonly seasonCompleteFired: boolean;
  // Match-wide round index at which Season Complete fired (null if not yet). Used by
  // the jackpot claim guard (01 §8.5) to check "same round" without walking events.
  readonly seasonCompleteRound: number | null;
  // Null while active; the round index (match-wide) at which the player was eliminated.
  readonly eliminatedAtRound: number | null;
  // Fingerprint of the latest known shield margin for cuts (01 §8.2). The configured
  // Winter shield effect carries a rankMargin; a copy of the latest value lives here so
  // the cut routine of ./cut.ts can read it without walking the ruleset.
  readonly shieldRankMargin: number;
}

// One card belonging to one player; cardsPerPlayer >= 1 copies live in RoundState.cards.
export interface CardMarks {
  readonly card: Card;
  readonly marks: readonly boolean[];
  // Prize keys already scored on this card during the current round (invariant 5).
  readonly scoredPrizes: readonly string[];
}

export interface RoundState {
  // Match-wide round index, used to seed the draw sequence (determinism, invariant 2).
  readonly roundIndex: number;
  readonly stageIndex: number;
  readonly roundInStage: number;
  readonly stage: StagePlanEntry;
  readonly drawSequence: readonly number[];
  readonly draws: readonly number[]; // items drawn so far (prefix of drawSequence)
  // Per player per card. Shape: [accountId][cardIndex].
  readonly cards: Readonly<Record<string, readonly CardMarks[]>>;
  // First-to-complete bookkeeping for pattern-first bonuses (01 §8.1) and the
  // `firstBingo` round-end condition with `graceDraws` (01 §7.3).
  readonly firstToPrize: Readonly<
    Record<string, { readonly accountId: string; readonly drawIndex: number }>
  >;
  readonly fullHouseBy: readonly string[]; // account ids who hit a full house this round
  // Classic round book-keeping (01 §3a.1). Empty for royale.
  readonly classicAwards: readonly ClassicAward[];
  readonly outstandingPrizes: readonly string[];
  readonly ended: boolean;
}

export interface ClassicAward {
  readonly prizeKey: string;
  readonly accountId: string;
  readonly drawIndex: number;
}

export interface MatchState {
  readonly matchId: string;
  readonly gameType: GameType;
  readonly ruleset: MatchRuleset;
  readonly seed: Uint8Array;
  readonly phase: MatchPhase;
  readonly stagePlan: readonly StagePlanEntry[];
  readonly stageIndex: number;
  readonly roundInStage: number;
  readonly roundIndex: number; // monotonic across stages, used for seeding and jackpot
  readonly players: Readonly<Record<string, PlayerState>>;
  readonly playerOrder: readonly string[]; // join order for stable iteration
  readonly currentRound: RoundState | null;
  readonly jackpot: {
    readonly unclaimedRounds: number;
    readonly claimedBy: string | null;
    readonly claimedAtRound: number | null;
    readonly value: number;
  };
  // Classic-only: the sorted prize list (catalogue order) ticked by the starter.
  readonly tickedPrizes: readonly string[];
  // Final placement, populated when phase === 'finished' (01 §7.5, §3a.2).
  readonly finalPlacement: readonly { readonly accountId: string; readonly place: number }[];
}

export function initialPlayerState(accountId: string, joinedAt: number): PlayerState {
  return {
    accountId,
    joinedAt,
    points: 0,
    patternsCount: 0,
    lastScoringDraw: null,
    effects: {
      multiplier: null,
      growth: null,
      shieldCharges: 0,
      seasonsActivated: 0,
      revealTickets: 0,
    },
    seasonCompleteFired: false,
    seasonCompleteRound: null,
    eliminatedAtRound: null,
    shieldRankMargin: 0,
  };
}
