/**
 * @file   packages/domain/src/classic/classic.test.ts
 * @module domain/classic
 * @brief  Classic placement rule (01 §3a.2) on hand-made awards.
 *
 * Responsibility: check each step of the placement order directly: most valuable prize
 *                 first, then number of prizes, then marks on the card, then join time;
 *                 the result is a total order 1..N. The full classic round itself is
 *                 tested through the lifecycle (../match/classicFlow.test.ts).
 * Depends on:     ../index
 * Spec:           docs/spec/01-game-design.md §3a.2
 */
import { describe, expect, it } from 'vitest';

import { BUILTIN_PRIZE_CATALOGUE_ORDER, classicPlacement, type PrizeAward } from '../index.js';

const players = ['a', 'b', 'c', 'd'].map((accountId, joinedAt) => ({ accountId, joinedAt }));
const award = (prizeKey: string, accountId: string): PrizeAward => ({
  prizeKey,
  accountId,
  drawIndex: 0,
});
const marks = (count: number): boolean[] => Array.from({ length: 25 }, (_v, i) => i < count);

function placeOf(awards: readonly PrizeAward[], markCounts: readonly number[]): string[] {
  const byAccount = Object.fromEntries(
    players.map((p, i) => [p.accountId, marks(markCounts[i] ?? 0)]),
  );
  return classicPlacement(players, awards, byAccount, BUILTIN_PRIZE_CATALOGUE_ORDER).map(
    (p) => p.accountId,
  );
}

describe('classicPlacement (01 §3a.2)', () => {
  it('ranks the most valuable prize first, even over more prizes', () => {
    const order = placeOf(
      [award('rows-1', 'a'), award('rows-2', 'a'), award('fullCard', 'b')],
      [5, 5, 5, 5],
    );
    expect(order.slice(0, 2)).toEqual(['b', 'a']);
  });

  it('breaks a tie on the top prize by number of prizes, then marks, then join time', () => {
    const order = placeOf(
      [award('fullCard', 'c'), award('fullCard', 'd'), award('rows-1', 'd')],
      [9, 3, 1, 1],
    );
    expect(order).toEqual(['d', 'c', 'a', 'b']);
    expect(placeOf([], [2, 2, 2, 2])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('produces places 1..N without gaps', () => {
    const places = classicPlacement(players, [], {}, BUILTIN_PRIZE_CATALOGUE_ORDER);
    expect(places.map((p) => p.place)).toEqual([1, 2, 3, 4]);
  });
});
