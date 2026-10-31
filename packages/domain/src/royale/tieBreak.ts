/**
 * @file   packages/domain/src/royale/tieBreak.ts
 * @module domain/royale
 * @brief  The tie-break chain of 01 §8.4, one comparator for every royale ranking.
 *
 * Responsibility: order two players by points, then patterns, then seasons activated,
 *                 then the earlier last scoring draw (never scored counts as latest), then
 *                 the earlier join; the cut, the final ranking and the round recap's
 *                 standings use it, so a tie is broken the same way everywhere.
 * Depends on:     nothing
 * Used by:        ./cut, ./finalRanking, ../index
 * Spec:           docs/spec/01-game-design.md §8.4
 */

export interface TieBreakScore {
  readonly points: number;
  readonly patterns: number;
  readonly seasonsActivated: number;
  readonly lastScoringDraw: number | null;
  readonly joinedAt: number;
}

// Negative when `a` ranks above `b`; 0 only for the same join time.
export function byTieBreak(a: TieBreakScore, b: TieBreakScore): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.patterns !== b.patterns) return b.patterns - a.patterns;
  if (a.seasonsActivated !== b.seasonsActivated) return b.seasonsActivated - a.seasonsActivated;
  const dA = a.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  const dB = b.lastScoringDraw ?? Number.POSITIVE_INFINITY;
  if (dA !== dB) return dA - dB;
  return a.joinedAt - b.joinedAt;
}
