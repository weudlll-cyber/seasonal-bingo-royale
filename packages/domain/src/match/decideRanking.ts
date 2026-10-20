/**
 * @file   packages/domain/src/match/decideRanking.ts
 * @module domain/match
 * @brief  Ranking helpers shared by decide (01 §7.5, §8.4).
 *
 * Responsibility: convert the live MatchState into the shapes expected by applyCut and
 *                 finalRanking, and compute the classic placement. Kept out of decide.ts
 *                 to stay under the file-size limit.
 * Depends on:     ../royale/cut, ../royale/finalRanking, ../classic/classicPlacement,
 *                 ../classic/prizeCatalogue, ./matchState
 * Used by:        ./decide
 * Spec:           docs/spec/01-game-design.md §3a.2, §7.5, §8.4
 */
import { classicPlacement } from '../classic/classicPlacement.js';
import { BUILTIN_PRIZE_CATALOGUE_ORDER } from '../classic/prizeCatalogue.js';
import type { Candidate } from '../royale/cut.js';
import type { RankedPlayer } from '../royale/finalRanking.js';
import type { MatchState } from './matchState.js';

// Classic types rank by most valuable prize, then prize count, then marks, then join
// time (01 §3a.2), from the awards and marks of the single round.
export function classicFinalPlacement(
  state: MatchState,
): readonly { readonly accountId: string; readonly place: number }[] {
  const round = state.currentRound;
  const players = state.playerOrder.flatMap((id) => {
    const p = state.players[id];
    return p === undefined ? [] : [{ accountId: id, joinedAt: p.joinedAt }];
  });
  const marks = Object.fromEntries(
    state.playerOrder.map((id) => [id, round?.cards[id]?.[0]?.marks ?? []]),
  );
  return classicPlacement(
    players,
    round?.classicAwards ?? [],
    marks,
    BUILTIN_PRIZE_CATALOGUE_ORDER,
  ).map((p) => ({ accountId: p.accountId, place: p.place }));
}

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
