/**
 * @file   packages/domain/src/match/roundEnd.ts
 * @module domain/match
 * @brief  Round-end predicates for the five conditions in 01 §7.3.
 *
 * Responsibility: given the current round state, decide whether the round should end
 *                 right now and why. Royale: drawCount, firstBingo (with graceDraws),
 *                 bingoQuota, firstFullHouse, and the always-present poolExhausted
 *                 upper bound. Classic: ends when every outstanding prize was awarded
 *                 or the pool is exhausted (01 §3a.1).
 * Depends on:     ./lifecycleTypes, ./matchState, ./events
 * Used by:        ./decide
 * Spec:           docs/spec/01-game-design.md §7.3, §3a.1
 */
import type { RoundEnd } from './lifecycleTypes.js';
import type { RoundState } from './matchState.js';
import type { RoundEnded } from './events.js';

export function royaleEndReason(
  round: RoundState,
  activeCount: number,
  cond: RoundEnd,
): RoundEnded['reason'] | null {
  // Pool-exhausted upper bound covers every condition (01 §7.3).
  if (round.draws.length >= round.drawSequence.length) return 'poolExhausted';
  switch (cond.kind) {
    case 'drawCount':
      return round.draws.length >= cond.draws ? 'drawCount' : null;
    case 'firstBingo':
      return firstBingoReason(round, cond.graceDraws);
    case 'bingoQuota':
      return quotaReason(round, activeCount, cond.quotaPercent);
    case 'firstFullHouse':
      return round.fullHouseBy.length > 0 ? 'firstFullHouse' : null;
  }
}

export function classicEndReason(round: RoundState): RoundEnded['reason'] | null {
  if (round.outstandingPrizes.length === 0 && round.draws.length > 0) return 'allPrizesAwarded';
  if (round.draws.length >= round.drawSequence.length) return 'poolExhausted';
  return null;
}

function firstBingoReason(round: RoundState, graceDraws: number): RoundEnded['reason'] | null {
  const entries = Object.values(round.firstToPrize);
  if (entries.length === 0) return null;
  const firstDraw = entries.reduce(
    (min, e) => Math.min(min, e.drawIndex),
    Number.POSITIVE_INFINITY,
  );
  const drawsSinceFirst = round.draws.length - 1 - firstDraw;
  return drawsSinceFirst >= graceDraws ? 'firstBingo' : null;
}

function quotaReason(
  round: RoundState,
  activeCount: number,
  quotaPercent: number,
): RoundEnded['reason'] | null {
  if (activeCount <= 0) return null;
  const need = Math.max(1, Math.ceil((activeCount * quotaPercent) / 100));
  const distinct = new Set(Object.values(round.firstToPrize).map((e) => e.accountId)).size;
  return distinct >= need ? 'bingoQuota' : null;
}
