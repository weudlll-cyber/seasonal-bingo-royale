/**
 * @file   packages/domain/src/card/generateCard.ts
 * @module domain/card
 * @brief  Deterministic card generation per game type (01 §4, §3a).
 *
 * Responsibility: build a card from a seed, the match + round indexes, the player's
 *                 account id and the card index. Column ranges match the classic 75-ball
 *                 Bingo rules; season cells sit in four different rows and columns, never
 *                 the centre; for `classicSeasons` each season cell carries its symbol
 *                 instead of a number, reducing the per-card number count from 24 to 20
 *                 (01 §3a). The free centre is on when `freeCenter` is true. Each
 *                 column's numbers ascend from top to bottom around those cells (D7).
 * Depends on:     ../draw/drbg, ./cardTypes, ../gameType, ../draw/pool
 * Used by:        ../match/* (future), tests, ../index
 * Spec:           docs/spec/01-game-design.md §4, §3a, docs/spec/12-testing-strategy.md §3
 */
import { createDrbg, type Drbg } from '../draw/drbg.js';
import type { GameType } from '../gameType.js';
import { SYMBOL_IDS } from '../draw/pool.js';
import {
  CARD_SIZE,
  CELL_COUNT,
  CENTRE_INDEX,
  columnOf,
  type Card,
  type Cell,
} from './cardTypes.js';

// Column ranges for the five columns: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75.
const COLUMN_RANGE_SIZE = 15;

export interface GenerateCardInput {
  readonly seed: Uint8Array;
  readonly matchId: string;
  readonly roundIndex: number;
  readonly accountId: string;
  readonly cardIndex: number;
  readonly gameType: GameType;
  readonly freeCenter: boolean;
}

export function generateCard(input: GenerateCardInput): Card {
  const label = `sbr/card/${input.matchId}/${String(input.roundIndex)}/${input.accountId}/${String(input.cardIndex)}`;
  const drbg = createDrbg(input.seed, label);
  const seasonCells =
    input.gameType === 'classic' ? null : pickSeasonCellPositions(drbg, input.freeCenter);
  const cells: (Cell | null)[] = Array.from({ length: CELL_COUNT }, (_v, index) =>
    fixedCellAt(index, seasonCells, input),
  );
  fillColumnsAscending(cells, pickColumnNumbers(drbg));
  return { cells: cells.map((cell) => cell ?? { kind: 'free' }), seasonCells };
}

// The cells whose position is fixed before numbers are placed: the free centre and, in
// classicSeasons, the season symbol cells. Every other cell (null) takes a number.
function fixedCellAt(
  index: number,
  seasonCells: readonly number[] | null,
  input: GenerateCardInput,
): Cell | null {
  if (input.freeCenter && index === CENTRE_INDEX) return { kind: 'free' };
  const seasonIndex = seasonCells?.indexOf(index) ?? -1;
  if (seasonIndex < 0 || input.gameType !== 'classicSeasons') return null;
  const symbol = SYMBOL_IDS[seasonIndex];
  if (symbol === undefined) throw new Error('season index out of range');
  return { kind: 'symbol', value: symbol };
}

// D7 (01 §4): each column's numbers ascend from top to bottom around the fixed cells.
// A column takes as many of its drawn numbers as it has open cells, sorted ascending.
function fillColumnsAscending(cells: (Cell | null)[], numbers: readonly number[][]): void {
  for (let column = 0; column < CARD_SIZE; column += 1) {
    const open = cells.flatMap((cell, index) =>
      cell === null && columnOf(index) === column ? [index] : [],
    );
    const values = (numbers[column] ?? []).slice(0, open.length).sort((a, b) => a - b);
    if (values.length !== open.length) throw new Error('missing column numbers');
    open.forEach((index, i) => {
      cells[index] = { kind: 'number', value: values[i] ?? 0 };
    });
  }
}

// Each column takes 5 distinct numbers from its 15-wide range; the N column uses only 4
// numbers when the free centre is on (row 2 of column 2 is the free cell).
function pickColumnNumbers(drbg: Drbg): readonly number[][] {
  const columns: number[][] = [];
  for (let column = 0; column < CARD_SIZE; column += 1) {
    const base = column * COLUMN_RANGE_SIZE + 1;
    const pool = Array.from({ length: COLUMN_RANGE_SIZE }, (_v, i) => base + i);
    // Partial Fisher-Yates: shuffle the first CARD_SIZE positions, keep them.
    for (let i = 0; i < CARD_SIZE; i += 1) {
      const j = i + drbg.nextInt(pool.length - i);
      const tmp = pool[i];
      const other = pool[j];
      if (tmp === undefined || other === undefined) throw new Error('shuffle out of bounds');
      pool[i] = other;
      pool[j] = tmp;
    }
    columns.push(pool.slice(0, CARD_SIZE));
  }
  return columns;
}

// Pick four cell indexes, one per season, in four different rows and four different
// columns, never the centre. Permute [0..4] for rows and [0..4] for columns, then take
// four distinct (row, col) pairs by dropping the one that lands on the centre.
function pickSeasonCellPositions(drbg: Drbg, freeCenter: boolean): readonly number[] {
  // Loop until we land on a layout that does not place a season on the centre; the
  // DRBG is deterministic, so this terminates in the same number of attempts for the
  // same seed and the retry is small (centre match probability per attempt = 1/5).
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const rows = shuffleRange(drbg, CARD_SIZE);
    const cols = shuffleRange(drbg, CARD_SIZE);
    const positions: number[] = [];
    let skipped = false;
    for (let s = 0; s < 4 && !skipped; s += 1) {
      const row = rows[s];
      const col = cols[s];
      if (row === undefined || col === undefined) throw new Error('season layout gap');
      const cellIndex = row * CARD_SIZE + col;
      if (freeCenter && cellIndex === CENTRE_INDEX) skipped = true;
      else positions.push(cellIndex);
    }
    if (!skipped && positions.length === 4) return positions;
  }
  throw new Error('could not place four season cells away from the centre');
}

function shuffleRange(drbg: Drbg, size: number): readonly number[] {
  const out = Array.from({ length: size }, (_v, i) => i);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = drbg.nextInt(i + 1);
    const tmp = out[i];
    const other = out[j];
    if (tmp === undefined || other === undefined) throw new Error('shuffle out of bounds');
    out[i] = other;
    out[j] = tmp;
  }
  return out;
}
