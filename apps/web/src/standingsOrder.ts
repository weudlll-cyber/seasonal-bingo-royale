/**
 * @file   apps/web/src/standingsOrder.ts
 * @module web
 * @brief  Order of the live standings: players still in the match first (01 §7.5, §13).
 *
 * Responsibility: compare two players for the live standings. Players still in the match
 *                 come first, by points; eliminated players follow, the latest eliminated
 *                 first, those of one cut in the order the server ranked them there (the
 *                 tie-break chain of 01 §8.4, as the final placement ranks them). Players
 *                 still in with equal points follow the server's ranking (`rankedIn`, a live
 *                 match), else the account id so the order is stable. Display order only; the
 *                 server decides cuts and the final placement.
 * Depends on:     ./playbackTypes
 * Used by:        ./playback
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4, §13
 */
import type { PlayerView } from './playbackTypes.js';

// `rankedIn`: the server's order of the players still in (a live match), else none.
export function standingsOrder(
  rankedIn: readonly string[] = [],
): (a: PlayerView, b: PlayerView) => number {
  const place = new Map(rankedIn.map((id, i) => [id, i]));
  const placeOf = (p: PlayerView): number => place.get(p.accountId) ?? Number.POSITIVE_INFINITY;
  return (a, b) => {
    const outA = a.eliminatedRound ?? Number.POSITIVE_INFINITY;
    const outB = b.eliminatedRound ?? Number.POSITIVE_INFINITY;
    if (outA !== outB) return outB - outA;
    // Out in the same cut: as the server ranked them there (01 §8.4), as the final will.
    if (a.outRank !== null && b.outRank !== null) return a.outRank - b.outRank;
    if (a.points !== b.points) return b.points - a.points;
    // Equal points among players still in: the server's ranking, then a stable order.
    return placeOf(a) - placeOf(b) || a.accountId.localeCompare(b.accountId);
  };
}
