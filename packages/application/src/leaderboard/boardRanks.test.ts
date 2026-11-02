/**
 * @file   packages/application/src/leaderboard/boardRanks.test.ts
 * @module application/leaderboard
 * @brief  Shared ranks on the boards (D28): standard competition ranking, 1, 2, 2, 4.
 *
 * Responsibility: rows equal on league points, wins and Season Completes share the rank of
 *                 the first of them and the next row skips the shared places; a difference in
 *                 any of the three separates the rows; no rows, no ranks.
 * Depends on:     ./boardRanks
 * Spec:           docs/spec/01-game-design.md §10 (D28)
 */
import { describe, expect, it } from 'vitest';

import { boardRanks, type BoardStanding } from './boardRanks.js';

const row = (points: number, wins = 0, seasonCompletes = 0): BoardStanding => ({
  points,
  wins,
  seasonCompletes,
});

describe('board ranks (D28)', () => {
  it('gives players equal on all three the same rank and skips the shared places', () => {
    expect(boardRanks([row(300), row(200), row(200), row(100)])).toEqual([1, 2, 2, 4]);
    expect(boardRanks([row(50), row(50), row(50), row(50), row(10)])).toEqual([1, 1, 1, 1, 5]);
  });

  it('separates rows that differ in wins or Season Completes', () => {
    expect(boardRanks([row(200, 2), row(200, 1, 1), row(200, 1), row(200, 1)])).toEqual([
      1, 2, 3, 3,
    ]);
  });

  it('ranks nothing when the board is empty', () => {
    expect(boardRanks([])).toEqual([]);
  });
});
