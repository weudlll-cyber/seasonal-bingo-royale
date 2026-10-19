/**
 * @file   packages/contracts/src/config/gameType.ts
 * @module contracts/config
 * @brief  Game-type enum shared by server, admin and web clients.
 *
 * Responsibility: name the three game types of 01 §3a and expose a type-safe
 *                 predicate for the "classic family" (`classicSeasons` and
 *                 `classic`) that governs prize handling and the lack of stages.
 * Depends on:     zod
 * Used by:        ./ruleset.ts, apps/server, apps/web, apps/admin
 * Spec:           docs/spec/01-game-design.md §3a
 */
import { z } from 'zod';

export const GameTypeSchema = z.enum(['royale', 'classicSeasons', 'classic']);
export type GameType = z.infer<typeof GameTypeSchema>;

export function isClassic(gameType: GameType): boolean {
  return gameType !== 'royale';
}
