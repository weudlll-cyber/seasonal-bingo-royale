/**
 * @file   apps/web/src/standingsOrder.ts
 * @module web
 * @brief  Order of the live standings: players still in the match first (01 §7.5, §13).
 *
 * Responsibility: compare two players for the live standings. Players still in the match
 *                 come first, by points; eliminated players follow, the latest eliminated
 *                 first (as the final placement ranks them), then by points. Ties fall
 *                 back to the account id so the order is stable. Display order only; the
 *                 server decides cuts and the final placement.
 * Depends on:     ./playbackTypes
 * Used by:        ./playback
 * Spec:           docs/spec/01-game-design.md §7.5, §13
 */
import type { PlayerView } from './playbackTypes.js';

export function standingsOrder(a: PlayerView, b: PlayerView): number {
  const outA = a.eliminatedRound ?? Number.POSITIVE_INFINITY;
  const outB = b.eliminatedRound ?? Number.POSITIVE_INFINITY;
  if (outA !== outB) return outB - outA;
  return b.points - a.points || a.accountId.localeCompare(b.accountId);
}
