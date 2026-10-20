/**
 * @file   packages/domain/src/card/card.properties.test.ts
 * @module domain/card
 * @brief  Property tests for card generation and determinism (12 §3 inv. 1, 2, 13).
 *
 * Responsibility: fast-check the shape invariants of the generated card and the
 *                 determinism guarantee. Covers invariant 1 (24 distinct numbers in
 *                 column ranges; season cells on 4 different rows and columns, never
 *                 the centre), invariant 2 (same inputs → same output; different
 *                 round index → independent output) and invariant 13 (classicSeasons
 *                 cards carry the four symbols instead of numbers at the season cells).
 * Depends on:     fast-check, ../index, ../../test/arbitraries
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 1, 2, 13
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  CARD_SIZE,
  CELL_COUNT,
  CENTRE_INDEX,
  columnOf,
  generateCard,
  rowOf,
  SYMBOL_IDS,
  type Card,
  type GenerateCardInput,
} from '../index.js';
import {
  accountIdArb,
  gameTypeArb,
  matchIdArb,
  numRuns,
  roundIndexArb,
  seedArb,
} from '../../test/arbitraries.js';

// A single arbitrary pack keeps every fc.property call at one parameter, dodging the
// max-params/max-lines-per-function limits while still varying every axis of the input.
type CardInputs = Omit<GenerateCardInput, 'cardIndex' | 'freeCenter'>;

const cardInputsArb: fc.Arbitrary<CardInputs> = fc.record({
  seed: seedArb,
  matchId: matchIdArb(),
  roundIndex: roundIndexArb,
  accountId: accountIdArb,
  gameType: gameTypeArb,
});

function makeCard(input: CardInputs): Card {
  return generateCard({ ...input, cardIndex: 0, freeCenter: true });
}

function checkColumnRanges(card: Card): void {
  card.cells.forEach((cell, index) => {
    if (cell.kind !== 'number') return;
    const base = columnOf(index) * 15 + 1;
    expect(cell.value).toBeGreaterThanOrEqual(base);
    expect(cell.value).toBeLessThanOrEqual(base + 14);
  });
}

function checkSeasonCells(cells: readonly number[] | null): void {
  expect(cells).not.toBeNull();
  if (cells === null) return;
  expect(cells).toHaveLength(4);
  expect(new Set(cells.map(rowOf)).size).toBe(4);
  expect(new Set(cells.map(columnOf)).size).toBe(4);
  expect(cells).not.toContain(CENTRE_INDEX);
}

describe('card invariant 1 (shape)', () => {
  it('invariant 1: numbers obey column ranges and the free centre is set', () => {
    fc.assert(
      fc.property(cardInputsArb, (input) => {
        const card = makeCard(input);
        expect(card.cells).toHaveLength(CELL_COUNT);
        expect(card.cells[CENTRE_INDEX]?.kind).toBe('free');
        checkColumnRanges(card);
      }),
      { numRuns },
    );
  });

  it('invariant 1: season cells span 4 rows and 4 columns, never the centre', () => {
    fc.assert(
      fc.property(cardInputsArb, (input) => {
        if (input.gameType === 'classic') return;
        checkSeasonCells(makeCard(input).seasonCells);
      }),
      { numRuns },
    );
  });
});

describe('card invariant 2 and 13 (determinism and classicSeasons)', () => {
  it('invariant 2: same inputs → identical cards', () => {
    fc.assert(
      fc.property(cardInputsArb, (input) => {
        expect(makeCard(input)).toEqual(makeCard(input));
      }),
      { numRuns },
    );
  });

  it('invariant 2: different round index → independent cards', () => {
    fc.assert(
      fc.property(cardInputsArb, (input) => {
        const a = makeCard({ ...input, roundIndex: 0 });
        const b = makeCard({ ...input, roundIndex: 1 });
        expect(a).not.toEqual(b);
      }),
      { numRuns },
    );
  });

  it('invariant 13: classicSeasons cards carry one symbol per season cell', () => {
    fc.assert(
      fc.property(cardInputsArb, (base) => {
        const input = { ...base, gameType: 'classicSeasons' as const };
        const card = makeCard(input);
        const seasonCells = card.seasonCells ?? [];
        seasonCells.forEach((cellIndex, seasonIndex) => {
          const cell = card.cells[cellIndex];
          expect(cell?.kind).toBe('symbol');
          if (cell?.kind === 'symbol') expect(cell.value).toBe(SYMBOL_IDS[seasonIndex]);
        });
        checkColumnRanges(card);
        const kinds = card.cells.map((c) => c.kind);
        expect(kinds.filter((k) => k === 'number').length).toBe(20);
        expect(kinds.filter((k) => k === 'symbol').length).toBe(4);
        expect(kinds.filter((k) => k === 'free').length).toBe(1);
        expect(card.cells).toHaveLength(CARD_SIZE * CARD_SIZE);
      }),
      { numRuns },
    );
  });
});
