/**
 * @file   packages/application/src/leaderboard/boardRanks.ts
 * @module application/leaderboard
 * @brief  The ranks of a leaderboard's rows, given in board order (01 §10).
 *
 * Responsibility: the rows arrive ordered by league points, wins and Season Completes (then
 *                 display name); rows equal on all three share the rank of the first of them
 *                 and the next row skips the shared places (standard competition ranking,
 *                 1, 2, 2, 4; D28). Pure: the server reads the rows and sends the ranks.
 * Depends on:     nothing
 * Used by:        ../index
 * Spec:           docs/spec/01-game-design.md §10
 */

export interface BoardStanding {
  readonly points: number;
  readonly wins: number;
  readonly seasonCompletes: number;
}

const tied = (a: BoardStanding, b: BoardStanding): boolean =>
  a.points === b.points && a.wins === b.wins && a.seasonCompletes === b.seasonCompletes;

export function boardRanks(rows: readonly BoardStanding[]): number[] {
  const ranks: number[] = [];
  rows.forEach((r, i) => {
    const above = rows[i - 1];
    // A row tied with the one above takes its rank; any other row its own position.
    ranks.push(above !== undefined && tied(r, above) ? (ranks[i - 1] ?? 1) : i + 1);
  });
  return ranks;
}
