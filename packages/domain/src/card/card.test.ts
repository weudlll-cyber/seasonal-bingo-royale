/**
 * @file   packages/domain/src/card/card.test.ts
 * @module domain/card
 * @brief  Card generation and pattern-detection tests (12 §3 invariants 1, 2, 13).
 *
 * Responsibility: lock in the per-card invariants of 12 §3 for every game type:
 *                 24 (royale/classic) or 20 (classicSeasons) distinct numbers in the
 *                 right B-I-N-G-O ranges, four season cells in four different rows and
 *                 columns on the royale / classicSeasons types (never on the free centre),
 *                 and the pattern detector reporting the right prize keys.
 * Depends on:     ../index
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 1, 2, 13
 */
import { describe, expect, it } from 'vitest';

import {
  CARD_SIZE,
  CELL_COUNT,
  CENTRE_INDEX,
  columnOf,
  completedPrizeKeys,
  completedPrizes,
  generateCard,
  rowOf,
  SEED_BYTES,
  type Card,
  type GameType,
  type Mark,
  type MarkMask,
} from '../index.js';

const seed = (byte: number): Uint8Array => new Uint8Array(SEED_BYTES).fill(byte);
const makeMarks = (card: Card): MarkMask =>
  Array.from({ length: CELL_COUNT }, (_v, i): Mark => card.cells[i]?.kind === 'free');
const markCells = (card: Card, indexes: readonly number[]): MarkMask => {
  const marks = [...makeMarks(card)] as Mark[];
  for (const i of indexes) marks[i] = true;
  return marks;
};

const CARD_INPUT = {
  seed: seed(42),
  matchId: 'M1',
  roundIndex: 0,
  accountId: 'alice',
  cardIndex: 0,
  freeCenter: true,
} as const;

describe('generateCard', () => {
  it.each<GameType>(['royale', 'classicSeasons', 'classic'])(
    'produces a well-formed card for %s',
    (gameType) => {
      const card = generateCard({ ...CARD_INPUT, gameType });
      expect(card.cells).toHaveLength(CELL_COUNT);
      expectColumnRanges(card);
      if (gameType === 'classic') {
        expect(card.seasonCells).toBeNull();
      } else {
        expectFourDistinctRowsAndColumns(card.seasonCells);
        expect(card.seasonCells?.includes(CENTRE_INDEX)).toBe(false);
      }
    },
  );

  it('is deterministic for the same inputs', () => {
    const a = generateCard({ ...CARD_INPUT, gameType: 'royale' });
    const b = generateCard({ ...CARD_INPUT, gameType: 'royale' });
    expect(a).toEqual(b);
  });

  it('classicSeasons season cells carry symbols, not numbers', () => {
    const card = generateCard({ ...CARD_INPUT, gameType: 'classicSeasons' });
    const seasonCells = card.seasonCells;
    if (seasonCells === null) throw new Error('expected season cells');
    for (const index of seasonCells) {
      const cell = card.cells[index];
      expect(cell?.kind).toBe('symbol');
    }
    const symbolCount = card.cells.filter((c) => c.kind === 'symbol').length;
    const numberCount = card.cells.filter((c) => c.kind === 'number').length;
    expect(symbolCount).toBe(4);
    expect(numberCount).toBe(CELL_COUNT - 4 - 1); // 20 numbers + 4 symbols + 1 free centre
  });

  it('royale cards still carry season cells with normal numbers', () => {
    const card = generateCard({ ...CARD_INPUT, gameType: 'royale' });
    const seasonCells = card.seasonCells;
    if (seasonCells === null) throw new Error('expected season cells');
    for (const index of seasonCells) {
      expect(card.cells[index]?.kind).toBe('number');
    }
  });
});

describe('completedPrizes', () => {
  const emptyMarks: MarkMask = Array<Mark>(CELL_COUNT).fill(false);

  it('reports nothing on an empty card', () => {
    expect(completedPrizes(emptyMarks)).toEqual({
      rows: 0,
      columns: 0,
      diagonals: 0,
      corners: false,
      full: false,
    });
    expect(completedPrizeKeys(emptyMarks)).toEqual([]);
  });

  it('reports a single row completion', () => {
    const card = generateCard({ ...CARD_INPUT, gameType: 'royale' });
    const row1 = [5, 6, 7, 8, 9];
    const marks = markCells(card, row1);
    const prizes = completedPrizes(marks);
    expect(prizes.rows).toBe(1);
    expect(completedPrizeKeys(marks)).toContain('rows-1');
  });

  it('reports a full card when every cell is marked', () => {
    const marks = Array<Mark>(CELL_COUNT).fill(true);
    const keys = completedPrizeKeys(marks);
    expect(keys).toContain('fullCard');
    expect(keys).toContain('rows-5');
    expect(keys).toContain('columns-5');
    expect(keys).toContain('bothDiagonals');
    expect(keys).toContain('fourCorners');
  });

  it('reports fourCorners when the four corners are marked', () => {
    const marks = markCells(
      { cells: Array<Card['cells'][number]>(CELL_COUNT).fill({ kind: 'free' }), seasonCells: null },
      [0, CARD_SIZE - 1, CELL_COUNT - CARD_SIZE, CELL_COUNT - 1],
    );
    expect(completedPrizes(marks).corners).toBe(true);
    expect(completedPrizeKeys(marks)).toContain('fourCorners');
  });
});

function expectColumnRanges(card: Card): void {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cell = card.cells[i];
    if (cell?.kind !== 'number') continue;
    const col = columnOf(i);
    const expectedMin = col * 15 + 1;
    const expectedMax = col * 15 + 15;
    expect(cell.value).toBeGreaterThanOrEqual(expectedMin);
    expect(cell.value).toBeLessThanOrEqual(expectedMax);
  }
  const numbers = card.cells.filter((c) => c.kind === 'number').map((c) => c.value);
  expect(new Set(numbers).size).toBe(numbers.length);
}

function expectFourDistinctRowsAndColumns(seasonCells: readonly number[] | null): void {
  if (seasonCells === null) throw new Error('season cells missing');
  expect(seasonCells).toHaveLength(4);
  const rows = new Set(seasonCells.map(rowOf));
  const cols = new Set(seasonCells.map(columnOf));
  expect(rows.size).toBe(4);
  expect(cols.size).toBe(4);
}
