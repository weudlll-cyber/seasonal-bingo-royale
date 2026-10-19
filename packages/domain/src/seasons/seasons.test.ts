/**
 * @file   packages/domain/src/seasons/seasons.test.ts
 * @module domain/seasons
 * @brief  Tests for applyEffect, tickEffects and Season Complete (12 §3 inv. 6, 9).
 *
 * Responsibility: cover the per-effect-type arithmetic, the non-stacking refresh rule,
 *                 the per-draw and per-mark decay, shield accumulation, and the single-
 *                 fire guard on Season Complete.
 * Depends on:     ../index
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3; docs/spec/12-testing-strategy.md §3
 */
import { describe, expect, it } from 'vitest';

import {
  applyEffect,
  checkSeasonComplete,
  consumeShield,
  INITIAL_EFFECT_STATE,
  markSeasonActivated,
  onDraw,
  onMarkInsideGrowth,
} from '../index.js';

describe('applyEffect', () => {
  it('addPoints returns the configured instant points', () => {
    const result = applyEffect(INITIAL_EFFECT_STATE, { type: 'addPoints', points: 50 });
    expect(result.instantPoints).toBe(50);
    expect(result.state).toEqual(INITIAL_EFFECT_STATE);
  });

  it('multiplier replaces an existing one (non-stacking refresh)', () => {
    const once = applyEffect(INITIAL_EFFECT_STATE, {
      type: 'multiplier',
      factor: 2,
      durationDraws: 3,
    });
    const twice = applyEffect(once.state, { type: 'multiplier', factor: 1.5, durationDraws: 8 });
    expect(twice.state.multiplier).toEqual({ factor: 1.5, remainingDraws: 8 });
  });

  it('growth starts at nthMark 0', () => {
    const result = applyEffect(INITIAL_EFFECT_STATE, {
      type: 'growth',
      pointsPerMark: 2,
      durationDraws: 5,
    });
    expect(result.state.growth).toEqual({ pointsPerMark: 2, remainingDraws: 5, nthMark: 0 });
  });

  it('harvest uses the caller-supplied scope count', () => {
    const result = applyEffect(
      INITIAL_EFFECT_STATE,
      { type: 'harvest', scope: 'row', pointsPerMarked: 15 },
      { markedCellsInScope: 3 },
    );
    expect(result.instantPoints).toBe(45);
  });

  it('shield adds charges', () => {
    const once = applyEffect(INITIAL_EFFECT_STATE, { type: 'shield', rankMargin: 3, charges: 2 });
    expect(once.state.shieldCharges).toBe(2);
    const twice = applyEffect(once.state, { type: 'shield', rankMargin: 3, charges: 1 });
    expect(twice.state.shieldCharges).toBe(3);
  });

  it('revealNext accumulates tickets', () => {
    const first = applyEffect(INITIAL_EFFECT_STATE, { type: 'revealNext', count: 2 });
    const second = applyEffect(first.state, { type: 'revealNext', count: 3 });
    expect(second.state.revealTickets).toBe(5);
  });
});

describe('tickEffects', () => {
  it('onDraw decrements remaining draws and expires at 0', () => {
    const seeded = applyEffect(INITIAL_EFFECT_STATE, {
      type: 'multiplier',
      factor: 2,
      durationDraws: 2,
    });
    const once = onDraw(seeded.state);
    expect(once.multiplier?.remainingDraws).toBe(1);
    const twice = onDraw(once);
    expect(twice.multiplier).toBeNull();
  });

  it('onDraw never produces a negative duration', () => {
    const seeded = applyEffect(INITIAL_EFFECT_STATE, {
      type: 'growth',
      pointsPerMark: 2,
      durationDraws: 1,
    });
    const once = onDraw(seeded.state);
    expect(once.growth).toBeNull();
    const twice = onDraw(once);
    expect(twice.growth).toBeNull();
  });

  it('onMarkInsideGrowth increases nthMark only when growth is active', () => {
    expect(onMarkInsideGrowth(INITIAL_EFFECT_STATE).growth).toBeNull();
    const seeded = applyEffect(INITIAL_EFFECT_STATE, {
      type: 'growth',
      pointsPerMark: 2,
      durationDraws: 5,
    });
    const bumped = onMarkInsideGrowth(seeded.state);
    expect(bumped.growth?.nthMark).toBe(1);
  });

  it('consumeShield only decrements when charges > 0', () => {
    expect(consumeShield(INITIAL_EFFECT_STATE).shieldCharges).toBe(0);
    const seeded = applyEffect(INITIAL_EFFECT_STATE, { type: 'shield', rankMargin: 3, charges: 2 });
    expect(consumeShield(seeded.state).shieldCharges).toBe(1);
  });
});

describe('Season Complete', () => {
  const cfg = { points: 300 };

  it('does not fire until all four seasons are activated', () => {
    let state = markSeasonActivated(INITIAL_EFFECT_STATE, 'spring');
    expect(checkSeasonComplete(state, false, cfg).fires).toBe(false);
    state = markSeasonActivated(state, 'summer');
    state = markSeasonActivated(state, 'autumn');
    expect(checkSeasonComplete(state, false, cfg).fires).toBe(false);
    state = markSeasonActivated(state, 'winter');
    expect(checkSeasonComplete(state, false, cfg)).toEqual({ fires: true, points: 300 });
  });

  it('does not fire a second time once already fired', () => {
    let state = INITIAL_EFFECT_STATE;
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      state = markSeasonActivated(state, season);
    }
    expect(checkSeasonComplete(state, true, cfg)).toEqual({ fires: false, points: 0 });
  });
});
