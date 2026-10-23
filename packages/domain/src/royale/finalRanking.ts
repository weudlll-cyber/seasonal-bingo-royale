/**
 * @file   packages/domain/src/royale/finalRanking.ts
 * @module domain/royale
 * @brief  Compute the final placement of every entrant (01 §8.4, §7.5).
 *
 * Responsibility: order every player of a royale match by points, patterns, seasons
 *                 activated, last-scoring-draw and finally join timestamp; return a
 *                 total order 1..N (invariant 8 of 12 §3). Eliminated players carry
 *                 their elimination order so they rank below every finalist.
 * Depends on:     nothing
 * Used by:        ../index, ../match/decide, ../match/decideRanking
 * Spec:           docs/spec/01-game-design.md §8.4, §7.5, docs/spec/12-testing-strategy.md §3 inv. 8
 */

export interface RankedPlayer {
  readonly accountId: string;
  readonly joinedAt: number;
  readonly points: number;
  readonly patterns: number;
  readonly seasonsActivated: number;
  readonly lastScoringDraw: number | null;
  // null for finalists; the match round index at which the player was cut, for the rest.
  // Lower values rank lower (eliminated earlier = worse place).
  readonly eliminatedAtRound: number | null;
}

export interface Placement {
  readonly accountId: string;
  readonly place: number;
}

export function finalRanking(players: readonly RankedPlayer[]): readonly Placement[] {
  // Stable-sort by the full tie-break chain of 01 §8.4; finalists (eliminatedAtRound
  // null) always beat eliminated players by this comparator.
  const sorted = [...players].sort(compare);
  return sorted.map((player, i) => ({ accountId: player.accountId, place: i + 1 }));
}

function compare(a: RankedPlayer, b: RankedPlayer): number {
  if ((a.eliminatedAtRound === null) !== (b.eliminatedAtRound === null)) {
    return a.eliminatedAtRound === null ? -1 : 1;
  }
  if (a.eliminatedAtRound !== null && b.eliminatedAtRound !== null) {
    if (a.eliminatedAtRound !== b.eliminatedAtRound) {
      return b.eliminatedAtRound - a.eliminatedAtRound;
    }
  }
  return byScore(a, b);
}

function byScore(a: RankedPlayer, b: RankedPlayer): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.patterns !== b.patterns) return b.patterns - a.patterns;
  if (a.seasonsActivated !== b.seasonsActivated) return b.seasonsActivated - a.seasonsActivated;
  const dA = a.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  const dB = b.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  if (dA !== dB) return dA - dB;
  return a.joinedAt - b.joinedAt;
}
