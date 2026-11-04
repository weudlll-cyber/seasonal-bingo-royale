/**
 * @file   packages/domain/src/match/harvest.test.ts
 * @module domain/match
 * @brief  The Autumn harvest scores the cells already marked in its scope (01 §8.2, audit-3 G1).
 *
 * Responsibility: a player marks the Autumn cell of a row that already holds three marked
 *                 cells: the activation's instant points are 3 × the harvest's points per
 *                 marked cell (15 by default); with none marked it is 0. (Every caller passed
 *                 0 marked cells, so the default Autumn effect never scored.)
 * Depends on:     vitest, ../seasons/effectState, ./matchState, ./markResolver, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §8.2
 */
import { describe, expect, it } from 'vitest';

import { INITIAL_EFFECT_STATE } from '../seasons/effectState.js';
import type { MatchState } from './matchState.js';
import { buildMarkEvents } from './markResolver.js';
import { royaleRuleset } from '../../test/builders.js';

// Season cells in season order: Autumn is cell 7, in the second row (cells 5–9).
const SEASON_CELLS = [0, 1, 7, 24];

function stateWith(marked: readonly number[]): MatchState {
  const cells = Array.from({ length: 25 }, (_v, i) =>
    i === 12 ? { kind: 'free' } : { kind: 'number', value: i + 1 },
  );
  const marks = Array.from({ length: 25 }, (_v, i) => i === 12 || marked.includes(i));
  return {
    gameType: 'royale',
    ruleset: royaleRuleset(),
    players: { p: { effects: INITIAL_EFFECT_STATE, points: 0, seasonCompleteFired: false } },
    jackpot: { claimedBy: null },
    currentRound: {
      stage: { stageMultiplier: 1, activePatterns: [] },
      classicAwards: [],
      fullHouseBy: [],
      windowClosedThrough: -1,
      cards: { p: [{ card: { cells, seasonCells: SEASON_CELLS }, marks, scoredPrizes: [] }] },
    },
  } as unknown as MatchState;
}

const harvestOf = (marked: readonly number[]): number | undefined => {
  const events = buildMarkEvents(stateWith(marked), {
    accountId: 'p',
    cardIndex: 0,
    cellIndex: 7,
    inSpeedWindow: false,
    speedBonus: 0,
  });
  const activated = events.find((e) => e.type === 'seasonActivated');
  return activated?.type === 'seasonActivated' ? activated.instantPoints : undefined;
};

describe('the Autumn harvest (01 §8.2)', () => {
  it('scores every cell already marked in the row of the season cell', () => {
    expect(harvestOf([5, 6, 9, 13])).toBe(3 * 15);
  });

  it('scores nothing in a row without marks', () => {
    expect(harvestOf([13, 20])).toBe(0);
  });
});
