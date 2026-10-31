/**
 * @file   packages/contracts/src/config/defaults/roundPause.ts
 * @module contracts/config/defaults
 * @brief  The default and the shortest pause between two royale rounds (D14, D21).
 *
 * Responsibility: the pause a royale match waits on its own after a round and its cut,
 *                 chosen at creation: 15 s by default (D21: the recap's three most
 *                 important cards), at least 3 s; the host may end it early. The other
 *                 choice is "the host starts the next round". A match setting, not part of
 *                 a ruleset, the same for both royale defaults (realtime and async).
 * Depends on:     nothing
 * Used by:        ../../index
 * Spec:           docs/spec/01-game-design.md §7.1 (D14, D21)
 */

export const DEFAULT_ROUND_PAUSE_MS = 15_000;
export const MIN_ROUND_PAUSE_MS = 3_000;
