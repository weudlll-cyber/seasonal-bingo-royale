/**
 * @file   apps/web/src/standingsOrder.ts
 * @module web
 * @brief  Order of the live standings: players still in the match first (01 §7.5, §13).
 *
 * Responsibility: compare two players for the live standings. Players still in the match
 *                 come first, by points; eliminated players follow, the latest eliminated
 *                 first, those of one cut in the order the server ranked them there (the
 *                 tie-break chain of 01 §8.4, as the final placement ranks them). Ties of
 *                 players still in fall back to the account id so the order is stable. Display order only; the
 *                 server decides cuts and the final placement.
 * Depends on:     ./playbackTypes
 * Used by:        ./playback
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4, §13
 */
import type { PlayerView } from './playbackTypes.js';

export function standingsOrder(a: PlayerView, b: PlayerView): number {
  const outA = a.eliminatedRound ?? Number.POSITIVE_INFINITY;
  const outB = b.eliminatedRound ?? Number.POSITIVE_INFINITY;
  if (outA !== outB) return outB - outA;
  // Out in the same cut: as the server ranked them there (01 §8.4), as the final will.
  if (a.outRank !== null && b.outRank !== null) return a.outRank - b.outRank;
  return b.points - a.points || a.accountId.localeCompare(b.accountId);
}
