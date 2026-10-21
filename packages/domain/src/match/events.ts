/**
 * @file   packages/domain/src/match/events.ts
 * @module domain/match
 * @brief  Domain events emitted by decide (02 §5.1).
 *
 * Responsibility: typed union of every event the aggregate ever appends to its log.
 *                 Replay (evolve folded over the full event list) must reproduce the
 *                 live state (invariant 4). Events are plain data; no behaviour.
 * Depends on:     ../card/cardTypes, ../gameType, ./lifecycleTypes
 * Used by:        ./decide, ./evolve, apps/server event log
 * Spec:           docs/spec/02-software-architecture.md §5.1–§5.2
 */
import type { Card } from '../card/cardTypes.js';
import type { GameType } from '../gameType.js';
import type { MatchRuleset, StagePlanEntry } from './lifecycleTypes.js';

export interface LobbyOpened {
  readonly type: 'lobbyOpened';
  readonly matchId: string;
  readonly gameType: GameType;
  readonly ruleset: MatchRuleset;
  readonly seed: Uint8Array;
  readonly stagePlan: readonly StagePlanEntry[];
  readonly tickedPrizes: readonly string[];
}
export interface PlayerJoined {
  readonly type: 'playerJoined';
  readonly accountId: string;
  readonly joinedAt: number;
  readonly human?: boolean; // absent for bots (01 §6)
}
export interface MatchStarted {
  readonly type: 'matchStarted';
}
export interface StageStarted {
  readonly type: 'stageStarted';
  readonly stageIndex: number;
}
export interface RoundStarted {
  readonly type: 'roundStarted';
  readonly roundIndex: number;
  readonly stageIndex: number;
  readonly roundInStage: number;
  readonly drawSequence: readonly number[];
  readonly cardsByPlayer: Readonly<Record<string, readonly Card[]>>;
}
export interface DrawMade {
  readonly type: 'drawMade';
  readonly drawIndex: number;
  readonly item: number;
}
// The speed window of draw `drawIndex` has closed (01 §6, D10): the round may end and
// classic prizes first completed on that draw are decided.
export interface SpeedWindowClosed {
  readonly type: 'speedWindowClosed';
  readonly drawIndex: number;
}
export interface CellMarked {
  readonly type: 'cellMarked';
  readonly accountId: string;
  readonly cardIndex: number;
  readonly cellIndex: number;
  readonly markPoints: number; // base + growth × multiplier, 0 for free centre
}
export interface SeasonActivated {
  readonly type: 'seasonActivated';
  readonly accountId: string;
  readonly season: 'spring' | 'summer' | 'autumn' | 'winter';
  readonly instantPoints: number;
}
export interface PatternScored {
  readonly type: 'patternScored';
  readonly accountId: string;
  readonly cardIndex: number;
  readonly prizeKey: string;
  readonly points: number;
  readonly firstInRound: boolean;
}
export interface SeasonCompleteFired {
  readonly type: 'seasonCompleteFired';
  readonly accountId: string;
  readonly points: number;
}
export interface JackpotClaimed {
  readonly type: 'jackpotClaimed';
  readonly accountId: string;
  readonly roundIndex: number;
  readonly value: number;
}
export interface ClassicPrizeAwarded {
  readonly type: 'classicPrizeAwarded';
  readonly accountId: string;
  readonly prizeKey: string;
  readonly drawIndex: number;
}
export interface RoundEnded {
  readonly type: 'roundEnded';
  readonly roundIndex: number;
  readonly reason:
    | 'drawCount'
    | 'firstBingo'
    | 'bingoQuota'
    | 'firstFullHouse'
    | 'poolExhausted'
    | 'allPrizesAwarded';
}
export interface CutApplied {
  readonly type: 'cutApplied';
  readonly stageIndex: number;
  readonly survivors: readonly string[];
  readonly eliminated: readonly string[];
  readonly shieldSaves: readonly string[];
}
export interface MatchFinished {
  readonly type: 'matchFinished';
  readonly placement: readonly { readonly accountId: string; readonly place: number }[];
}
// When the next round starts (epoch ms), so the countdown survives a restart.
export interface NextRoundScheduled {
  readonly type: 'nextRoundScheduled';
  readonly at: number;
}
export interface MatchAborted {
  readonly type: 'matchAborted';
  readonly reason: string;
}

export type DomainEvent =
  | LobbyOpened
  | PlayerJoined
  | MatchStarted
  | StageStarted
  | RoundStarted
  | DrawMade
  | SpeedWindowClosed
  | CellMarked
  | SeasonActivated
  | PatternScored
  | SeasonCompleteFired
  | JackpotClaimed
  | ClassicPrizeAwarded
  | RoundEnded
  | CutApplied
  | MatchFinished
  | NextRoundScheduled
  | MatchAborted;
