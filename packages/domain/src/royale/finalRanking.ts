/**
 * @file   packages/domain/src/royale/finalRanking.ts
 * @module domain/royale
 * @brief  Compute the final placement of every entrant (01 §8.4, §7.5).
 *
 * Responsibility: the final's winner first (by its win condition, 01 §7.5; winners on the
 *                 same draw by the chain below), then every player by points, patterns,
 *                 seasons activated, last-scoring-draw and finally join timestamp; return
 *                 a total order 1..N (invariant 8 of 12 §3). Eliminated players carry
 *                 their elimination order so they rank below every finalist.
 * Depends on:     ./tieBreak
 * Used by:        ../index, ../match/decide, ../match/decideRanking
 * Spec:           docs/spec/01-game-design.md §8.4, §7.5, docs/spec/12-testing-strategy.md §3 inv. 8
 */
import { byTieBreak } from './tieBreak.js';

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

// `winners`: the finalists who won the final by its win condition (01 §7.5): the full
// card, the first completed pattern; none for the highest score, where points decide.
export function finalRanking(
  players: readonly RankedPlayer[],
  winners: ReadonlySet<string> = new Set(),
): readonly Placement[] {
  // Stable-sort: the final's winners first (among them the tie-break chain of 01 §8.4),
  // then the other finalists, then eliminated players by elimination order.
  const won = (p: RankedPlayer): boolean =>
    p.eliminatedAtRound === null && winners.has(p.accountId);
  const sorted = [...players].sort((a, b) => {
    if (won(a) !== won(b)) return won(a) ? -1 : 1;
    return compare(a, b);
  });
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
  return byTieBreak(a, b);
}
