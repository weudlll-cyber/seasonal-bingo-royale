/**
 * @file   packages/domain/src/card/patterns.ts
 * @module domain/card
 * @brief  Built-in pattern masks and completion detection on marked cards.
 *
 * Responsibility: generate the pattern masks for every prize key of 01 §3a.1 (rows-N,
 *                 columns-N, oneDiagonal, bothDiagonals, fourCorners, fullCard) and
 *                 expose a helper that answers which prize keys are complete on a given
 *                 marked bitmask. "oneDiagonal" and "rows-N" cover any diagonal / any N
 *                 complete rows, so the set is a function of the set of complete rows,
 *                 columns and diagonals — matching the catalogue of 01 §3a.1.
 * Depends on:     ./cardTypes
 * Used by:        ../match/* (future), tests
 * Spec:           docs/spec/01-game-design.md §3a.1, docs/spec/04-database-design.md §3.2
 */
import { CARD_SIZE, CELL_COUNT } from './cardTypes.js';

export type Mark = boolean;
export type MarkMask = readonly Mark[]; // length CELL_COUNT, row-major

export const ROW_MASKS: readonly MarkMask[] = buildRowMasks();
export const COLUMN_MASKS: readonly MarkMask[] = buildColumnMasks();
export const DIAGONAL_MASKS: readonly MarkMask[] = buildDiagonalMasks();
export const CORNERS_MASK: MarkMask = buildCornersMask();
export const FULL_MASK: MarkMask = Array<Mark>(CELL_COUNT).fill(true);

export interface CompletedPrizes {
  readonly rows: number;
  readonly columns: number;
  readonly diagonals: number;
  readonly corners: boolean;
  readonly full: boolean;
}

export function completedPrizes(marks: MarkMask): CompletedPrizes {
  const rows = ROW_MASKS.filter((mask) => covers(marks, mask)).length;
  const columns = COLUMN_MASKS.filter((mask) => covers(marks, mask)).length;
  const diagonals = DIAGONAL_MASKS.filter((mask) => covers(marks, mask)).length;
  const corners = covers(marks, CORNERS_MASK);
  const full = covers(marks, FULL_MASK);
  return { rows, columns, diagonals, corners, full };
}

// Translate the row/column/diagonal/corners/full numbers into the catalogue keys of
// 01 §3a.1 so WP-07 can award prizes without replicating the mapping. The list is
// returned in catalogue order (lowest-to-highest), ready for placement tie-breaks.
export function completedPrizeKeys(marks: MarkMask): readonly string[] {
  const prizes = completedPrizes(marks);
  const out: string[] = [];
  // Interleave rows-N and columns-N in catalogue order (rows-1, columns-1, rows-2, …).
  const maxN = Math.max(prizes.rows, prizes.columns);
  for (let n = 1; n <= maxN; n += 1) {
    if (prizes.rows >= n) out.push(`rows-${String(n)}`);
    if (prizes.columns >= n) out.push(`columns-${String(n)}`);
  }
  if (prizes.corners) out.push('fourCorners');
  if (prizes.diagonals >= 1) out.push('oneDiagonal');
  if (prizes.diagonals === DIAGONAL_MASKS.length) out.push('bothDiagonals');
  if (prizes.full) out.push('fullCard');
  return out;
}

function covers(marks: MarkMask, mask: MarkMask): boolean {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (mask[i] && !marks[i]) return false;
  }
  return true;
}

function buildRowMasks(): readonly MarkMask[] {
  const rows: MarkMask[] = [];
  for (let r = 0; r < CARD_SIZE; r += 1) {
    const mask = Array<Mark>(CELL_COUNT).fill(false);
    for (let c = 0; c < CARD_SIZE; c += 1) mask[r * CARD_SIZE + c] = true;
    rows.push(mask);
  }
  return rows;
}

function buildColumnMasks(): readonly MarkMask[] {
  const cols: MarkMask[] = [];
  for (let c = 0; c < CARD_SIZE; c += 1) {
    const mask = Array<Mark>(CELL_COUNT).fill(false);
    for (let r = 0; r < CARD_SIZE; r += 1) mask[r * CARD_SIZE + c] = true;
    cols.push(mask);
  }
  return cols;
}

function buildDiagonalMasks(): readonly MarkMask[] {
  const topLeft = Array<Mark>(CELL_COUNT).fill(false);
  const topRight = Array<Mark>(CELL_COUNT).fill(false);
  for (let i = 0; i < CARD_SIZE; i += 1) {
    topLeft[i * CARD_SIZE + i] = true;
    topRight[i * CARD_SIZE + (CARD_SIZE - 1 - i)] = true;
  }
  return [topLeft, topRight];
}

function buildCornersMask(): MarkMask {
  const mask = Array<Mark>(CELL_COUNT).fill(false);
  mask[0] = true;
  mask[CARD_SIZE - 1] = true;
  mask[CELL_COUNT - CARD_SIZE] = true;
  mask[CELL_COUNT - 1] = true;
  return mask;
}
