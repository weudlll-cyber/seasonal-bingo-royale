/**
 * @file   packages/domain/src/seasons/effects.properties.test.ts
 * @module domain/seasons
 * @brief  Property tests for effects, Season Complete and jackpot (12 §3 inv. 6, 9, 10).
 *
 * Responsibility: durations never negative; non-stacking refresh respected; multipliers
 *                 apply after growth (invariant 9). Season Complete fires exactly once
 *                 per player per match iff all four bits are set (invariant 6). Jackpot
 *                 value = base + growth × unclaimed (invariant 10).
 * Depends on:     fast-check, ../index, ../../test/arbitraries
 * Spec:           docs/spec/12-testing-strategy.md §3 invariants 6, 9, 10
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  applyEffect,
  checkSeasonComplete,
  INITIAL_EFFECT_STATE,
  jackpotValue,
  markSeasonActivated,
  onDraw,
  onMarkInsideGrowth,
  scoreMark,
  SEASON_NAMES,
} from '../index.js';
import { numRuns } from '../../test/arbitraries.js';

const factorArb = fc.integer({ min: 1, max: 10 });
const durationArb = fc.integer({ min: 1, max: 75 });
const pointsPerMarkArb = fc.integer({ min: 1, max: 100 });

function tickedDurations(factor: number, duration: number, pointsPerMark: number, ticks: number) {
  const seeded = applyEffect(
    applyEffect(INITIAL_EFFECT_STATE, { type: 'multiplier', factor, durationDraws: duration })
      .state,
    { type: 'growth', pointsPerMark, durationDraws: duration },
  );
  let state = seeded.state;
  for (let i = 0; i < ticks; i += 1) state = onDraw(state);
  if (state.multiplier !== null) expect(state.multiplier.remainingDraws).toBeGreaterThan(0);
  if (state.growth !== null) expect(state.growth.remainingDraws).toBeGreaterThan(0);
}

function multiplierReplaces(f1: number, d1: number, f2: number, d2: number) {
  const first = applyEffect(INITIAL_EFFECT_STATE, {
    type: 'multiplier',
    factor: f1,
    durationDraws: d1,
  });
  const second = applyEffect(first.state, { type: 'multiplier', factor: f2, durationDraws: d2 });
  expect(second.state.multiplier).toEqual({ factor: f2, remainingDraws: d2 });
}

function multiplierAfterGrowth(factor: number, duration: number, pointsPerMark: number) {
  const base = applyEffect(INITIAL_EFFECT_STATE, {
    type: 'growth',
    pointsPerMark,
    durationDraws: duration,
  });
  const withMult = applyEffect(base.state, { type: 'multiplier', factor, durationDraws: duration });
  const bumped = onMarkInsideGrowth(withMult.state);
  const score = scoreMark({ pointsPerMark: 10 }, bumped);
  expect(score).toBe(Math.round((10 + pointsPerMark) * factor));
}

describe('effect invariant 9: durations and non-stacking', () => {
  it('durations never go below zero after many onDraw ticks', () => {
    fc.assert(
      fc.property(
        factorArb,
        durationArb,
        pointsPerMarkArb,
        fc.integer({ min: 0, max: 100 }),
        tickedDurations,
      ),
      { numRuns },
    );
  });

  it('a second multiplier replaces, not stacks', () => {
    fc.assert(fc.property(factorArb, durationArb, factorArb, durationArb, multiplierReplaces), {
      numRuns,
    });
  });

  it('multiplier applied after growth', () => {
    fc.assert(fc.property(factorArb, durationArb, pointsPerMarkArb, multiplierAfterGrowth), {
      numRuns,
    });
  });
});

function checkSeasonCompleteFires(subset: string[]) {
  let state = INITIAL_EFFECT_STATE;
  for (const season of subset) {
    state = markSeasonActivated(state, season as (typeof SEASON_NAMES)[number]);
  }
  const result = checkSeasonComplete(state, false, { points: 300 });
  const allFour = new Set(subset).size === SEASON_NAMES.length;
  expect(result.fires).toBe(allFour);
}

describe('Season Complete invariant 6', () => {
  it('fires exactly once iff all four season bits are set', () => {
    fc.assert(fc.property(fc.subarray([...SEASON_NAMES] as string[]), checkSeasonCompleteFires), {
      numRuns,
    });
  });

  it('does not fire a second time once already fired', () => {
    let state = INITIAL_EFFECT_STATE;
    for (const season of SEASON_NAMES) state = markSeasonActivated(state, season);
    expect(checkSeasonComplete(state, true, { points: 300 }).fires).toBe(false);
  });
});

describe('jackpot invariant 10', () => {
  it('value = base + growth × unclaimedRounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100 }),
        (base, growthPerRound, unclaimed) => {
          expect(jackpotValue({ base, growthPerRound }, unclaimed)).toBe(
            base + growthPerRound * unclaimed,
          );
        },
      ),
      { numRuns },
    );
  });
});
