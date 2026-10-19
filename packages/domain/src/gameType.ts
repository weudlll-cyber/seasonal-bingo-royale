/**
 * @file   packages/domain/src/gameType.ts
 * @module domain
 * @brief  Game-type literal used across the domain layer.
 *
 * Responsibility: expose the three literal strings of 01 §3a so the domain stays
 *                 free of workspace-package imports (the layer rules forbid domain
 *                 from importing contracts). The literal union is identical to
 *                 contracts/config/gameType and widens together with it.
 * Depends on:     nothing
 * Used by:        ./card/*, ./draw/*, ./match/*
 * Spec:           docs/spec/01-game-design.md §3a
 */

export type GameType = 'royale' | 'classicSeasons' | 'classic';

export function isClassic(gameType: GameType): boolean {
  return gameType !== 'royale';
}
