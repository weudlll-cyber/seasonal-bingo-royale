/**
 * @file   packages/contracts/src/config/defaults/leaderboard.ts
 * @module contracts/config/defaults
 * @brief  The default leaderboard settings: league points per place and who counts (01 §10, 03 §11).
 *
 * Responsibility: the placement-points table (1st 100, 2nd 70, 3rd 50, 4–10 25, 11–25 10),
 *                 the finalist bonus (+10 for royale players never eliminated), the finish
 *                 bonus (+2 for everyone with a final place), and the integrity rule: league
 *                 points only from matches with at least 8 distinct verified human players.
 *                 The admin's `leaderboard` settings document replaces it later (WP-20); a
 *                 period stores the table it was created with (04 §3.4).
 * Depends on:     nothing
 * Used by:        ./index
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/03-security-architecture.md §11
 */

// Places `from` to `to` (both included) earn `points`; a place outside every band earns none.
interface PlacementBand {
  readonly from: number;
  readonly to: number;
  readonly points: number;
}

export interface LeaderboardConfig {
  readonly placementPoints: readonly PlacementBand[];
  readonly finalistBonus: number;
  readonly finishBonus: number;
  readonly minPlayersForPoints: number;
  // Count only accounts with a confirmed e-mail address (03 §11 "distinct verified players").
  readonly requireVerifiedPlayers: boolean;
}

export const LEADERBOARD_DEFAULTS: LeaderboardConfig = Object.freeze({
  placementPoints: Object.freeze([
    { from: 1, to: 1, points: 100 },
    { from: 2, to: 2, points: 70 },
    { from: 3, to: 3, points: 50 },
    { from: 4, to: 10, points: 25 },
    { from: 11, to: 25, points: 10 },
  ]),
  finalistBonus: 10,
  finishBonus: 2,
  minPlayersForPoints: 8,
  requireVerifiedPlayers: true,
});
