/**
 * @file   packages/domain/src/card/cardTypes.ts
 * @module domain/card
 * @brief  Card type definitions shared across the domain layer.
 *
 * Responsibility: the shape of a generated card: a flat array of 25 cells, each either
 *                 a number cell (B-I-N-G-O column number), a free centre, or (in
 *                 `classicSeasons`) a season-symbol cell. The row-major layout matches
 *                 `cards.marked bit(25)` in 04 §3.3 so projection to the DB is trivial.
 * Depends on:     ../draw/pool (SymbolId)
 * Used by:        ./generateCard.ts, ./patterns.ts, ../match/*, ../index
 * Spec:           docs/spec/01-game-design.md §4, §3a, docs/spec/04-database-design.md §3.3
 */
import type { SymbolId } from '../draw/pool.js';

export const CARD_SIZE = 5;
export const CELL_COUNT = CARD_SIZE * CARD_SIZE; // 25
export const CENTRE_INDEX = 12; // row 2, column 2

export type Cell =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'free' }
  | { readonly kind: 'symbol'; readonly value: SymbolId };

export interface Card {
  readonly cells: readonly Cell[];
  // Four season cells identified by cell index (0..24), always in the order
  // spring, summer, autumn, winter — matches cards.season_cells in 04 §3.3.
  // null for the `classic` game type, which has no season cells.
  readonly seasonCells: readonly number[] | null;
}

export function rowOf(index: number): number {
  return Math.floor(index / CARD_SIZE);
}

export function columnOf(index: number): number {
  return index % CARD_SIZE;
}
