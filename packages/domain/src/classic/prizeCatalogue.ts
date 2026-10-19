/**
 * @file   packages/domain/src/classic/prizeCatalogue.ts
 * @module domain/classic
 * @brief  Catalogue order of the built-in prize keys (01 §3a.1).
 *
 * Responsibility: the layer rules forbid domain from importing @sbr/contracts; this
 *                 file duplicates the (immutable) catalogue order so classicPlacement
 *                 can compute "most valuable prize won" without a cross-layer import.
 *                 Both lists widen together: new built-in prizes need code anyway.
 * Depends on:     nothing
 * Used by:        ./classicPlacement, future match orchestration
 * Spec:           docs/spec/01-game-design.md §3a.1
 */

export const BUILTIN_PRIZE_CATALOGUE_ORDER: readonly string[] = Object.freeze([
  'rows-1',
  'columns-1',
  'rows-2',
  'columns-2',
  'rows-3',
  'columns-3',
  'rows-4',
  'columns-4',
  'rows-5',
  'columns-5',
  'fourCorners',
  'oneDiagonal',
  'bothDiagonals',
  'fullCard',
]);
