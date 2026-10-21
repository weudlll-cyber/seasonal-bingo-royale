/**
 * @file   packages/domain/src/match/commands.ts
 * @module domain/match
 * @brief  Commands accepted by the match aggregate (02 §5.1).
 *
 * Responsibility: the typed command union the aggregate dispatches on. One tag per
 *                 lifecycle action listed in 02 §5.1 (openLobby, joinMatch, startMatch,
 *                 startRound, drawNext, markCell, autoMarkMissed, closeSpeedWindow,
 *                 endRound, applyCut,
 *                 startStage, finishMatch, abortMatch). Pure data; no behaviour.
 * Depends on:     ./lifecycleTypes, ./matchState (none runtime)
 * Used by:        ./decide, apps/server command handlers
 * Spec:           docs/spec/02-software-architecture.md §5.1, docs/spec/01-game-design.md §3
 */
import type { GameType } from '../gameType.js';
import type { MatchRuleset } from './lifecycleTypes.js';

export interface OpenLobby {
  readonly type: 'openLobby';
  readonly matchId: string;
  readonly gameType: GameType;
  readonly ruleset: MatchRuleset;
  readonly seed: Uint8Array;
  readonly tickedPrizes: readonly string[];
}

export interface JoinMatch {
  readonly type: 'joinMatch';
  readonly accountId: string;
  readonly joinedAt: number;
  // True for a person who taps in manual marking mode; bots leave it out and always
  // mark on the draw (01 §6).
  readonly human?: boolean;
}

export interface StartMatch {
  readonly type: 'startMatch';
}
export interface StartStage {
  readonly type: 'startStage';
}
export interface StartRound {
  readonly type: 'startRound';
}
export interface DrawNext {
  readonly type: 'drawNext';
}
// The mark command models a manual tap on one cell. The server validates that the item
// has actually been drawn in the current round; the result is a MarkRecorded event with
// `inSpeedWindow` set by the caller based on the clock vs. the draw timestamp.
export interface MarkCell {
  readonly type: 'markCell';
  readonly accountId: string;
  readonly cardIndex: number;
  readonly cellIndex: number;
  readonly inSpeedWindow: boolean;
  // Speed bonus points pre-computed by the application layer (01 §8.1 linear decay).
  readonly speedBonus: number;
}
// Issued by the scheduler once the missed-number delay after draw `drawIndex`
// has passed (ruleset missedNumbers autoMarkAfter): every tapping player's still-open cell
// for that item is marked without the speed bonus (01 §6). Ignored under noAutoMark.
export interface AutoMarkMissed {
  readonly type: 'autoMarkMissed';
  readonly drawIndex: number;
}
// Issued by the scheduler when the speed window of the latest draw closes (01 §6, D10).
// Only after it may the round end; until then the last number can still be tapped.
export interface CloseSpeedWindow {
  readonly type: 'closeSpeedWindow';
  readonly drawIndex: number;
}
export interface EndRound {
  readonly type: 'endRound';
}
export interface ApplyCut {
  readonly type: 'applyCut';
}
export interface FinishMatch {
  readonly type: 'finishMatch';
}
export interface AbortMatch {
  readonly type: 'abortMatch';
  readonly reason: string;
}

export type Command =
  | OpenLobby
  | JoinMatch
  | StartMatch
  | StartStage
  | StartRound
  | DrawNext
  | MarkCell
  | AutoMarkMissed
  | CloseSpeedWindow
  | EndRound
  | ApplyCut
  | FinishMatch
  | AbortMatch;
