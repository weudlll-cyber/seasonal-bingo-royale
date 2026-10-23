/**
 * @file   packages/domain/src/draw/pool.ts
 * @module domain/draw
 * @brief  Game-type-specific pool of draw items (01 §3a, §5).
 *
 * Responsibility: enumerate the draw pool a round uses. `royale` and `classic` draw
 *                 from the 75 numbers; `classicSeasons` adds the four season symbols
 *                 101–104 (04 §3.3). Pure helpers used by the draw sequence and the
 *                 card generator.
 * Depends on:     ../gameType
 * Used by:        ./drawSequence.ts, ../card/generateCard.ts, ../card/cardTypes, ../index,
 *                 ../match/lifecycleTypes, ../match/markResolver, ../seasons/effectState
 * Spec:           docs/spec/01-game-design.md §3a, §5, docs/spec/04-database-design.md §3.3
 */
import type { GameType } from '../gameType.js';

export const NUMBER_MIN = 1;
export const NUMBER_MAX = 75;

// Season symbol identifiers (04 §3.3). Spring → 101, Summer → 102, Autumn → 103, Winter → 104.
// The order matches `cards.season_cells` so a season index maps 1:1 to a symbol value.
export const SYMBOL_IDS = [101, 102, 103, 104] as const;
export type SymbolId = (typeof SYMBOL_IDS)[number];
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonName = (typeof SEASON_NAMES)[number];

export function poolSize(gameType: GameType): number {
  return gameType === 'classicSeasons' ? NUMBER_MAX + SYMBOL_IDS.length : NUMBER_MAX;
}

export function poolItems(gameType: GameType): readonly number[] {
  const numbers = Array.from({ length: NUMBER_MAX }, (_v, i) => i + NUMBER_MIN);
  return gameType === 'classicSeasons' ? [...numbers, ...SYMBOL_IDS] : numbers;
}
