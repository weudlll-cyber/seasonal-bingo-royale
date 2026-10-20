/**
 * @file   packages/domain/src/match/decideRanking.ts
 * @module domain/match
 * @brief  Ranking helpers shared by decide (01 §7.5, §8.4).
 *
 * Responsibility: convert the live MatchState into the shapes expected by applyCut and
 *                 finalRanking. Kept out of decide.ts to stay under the file-size limit.
 * Depends on:     ../royale/cut, ../royale/finalRanking, ./matchState
 * Used by:        ./decide
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4
 */
import type { Candidate } from '../royale/cut.js';
import type { RankedPlayer } from '../royale/finalRanking.js';
import type { MatchState } from './matchState.js';

export function activeAccountIds(state: MatchState): readonly string[] {
  return state.playerOrder.filter((id) => state.players[id]?.eliminatedAtRound === null);
}

export function candidateOf(state: MatchState, id: string): Candidate {
  const p = state.players[id];
  if (p === undefined) throw new Error(`candidateOf: unknown account ${id}`);
  return {
    accountId: id,
    points: p.points,
    patterns: p.patternsCount,
    seasonsActivated: countBits(p.effects.seasonsActivated),
    lastScoringDraw: p.lastScoringDraw,
    joinedAt: p.joinedAt,
    shieldCharges: p.effects.shieldCharges,
    shieldRankMargin: p.shieldRankMargin,
  };
}

export function rankedPlayerOf(state: MatchState, id: string): RankedPlayer {
  const p = state.players[id];
  if (p === undefined) throw new Error(`rankedPlayerOf: unknown account ${id}`);
  return {
    accountId: id,
    joinedAt: p.joinedAt,
    points: p.points,
    patterns: p.patternsCount,
    seasonsActivated: countBits(p.effects.seasonsActivated),
    lastScoringDraw: p.lastScoringDraw,
    eliminatedAtRound: p.eliminatedAtRound,
  };
}

export function countBits(mask: number): number {
  let count = 0;
  let m = mask;
  while (m > 0) {
    count += m & 1;
    m >>= 1;
  }
  return count;
}
