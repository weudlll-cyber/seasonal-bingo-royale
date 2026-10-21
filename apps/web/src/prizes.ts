/**
 * @file   apps/web/src/prizes.ts
 * @module web
 * @brief  The classic prize list a starter can tick, and the default selection (01 §3a.1).
 *
 * Responsibility: the built-in prizes in catalogue order as the forms offer them, and the
 *                 five ticked by default (rows-1, rows-2, fourCorners, oneDiagonal,
 *                 fullCard). Shared by the Quick Test form and the host's create form.
 * Depends on:     nothing
 * Used by:        ./components/StartForm, ./host/CreateMatch
 * Spec:           docs/spec/01-game-design.md §3a.1; docs/spec/11-admin-panel.md §3.2
 */

export const PRIZE_CATALOGUE: readonly string[] = [
  'rows-1',
  'rows-2',
  'rows-3',
  'rows-4',
  'rows-5',
  'columns-1',
  'columns-2',
  'fourCorners',
  'oneDiagonal',
  'bothDiagonals',
  'fullCard',
];

export const DEFAULT_PRIZES: readonly string[] = [
  'rows-1',
  'rows-2',
  'fourCorners',
  'oneDiagonal',
  'fullCard',
];
