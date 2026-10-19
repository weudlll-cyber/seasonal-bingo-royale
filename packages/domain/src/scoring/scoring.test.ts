/**
 * @file   packages/domain/src/scoring/scoring.test.ts
 * @module domain/scoring
 * @brief  Tests for mark/pattern scoring and the speed bonus (01 §8.1, 12 §3 inv. 9).
 *
 * Responsibility: cover the arithmetic — base points, growth additive before multiplier,
 *                 first-to-pattern bonus, speed-bonus linear decay including the boundary
 *                 and the past-window behaviour.
 * Depends on:     ../index
 * Spec:           docs/spec/01-game-design.md §8.1, docs/spec/12-testing-strategy.md §3
 */
import { describe, expect, it } from 'vitest';

import {
  INITIAL_EFFECT_STATE,
  scoreMark,
  scorePattern,
  speedBonus,
  type EffectState,
} from '../index.js';

const withEffects = (patch: Partial<EffectState>): EffectState => ({
  ...INITIAL_EFFECT_STATE,
  ...patch,
});

describe('scoreMark', () => {
  it('returns base points on an empty state', () => {
    expect(scoreMark({ pointsPerMark: 10 }, INITIAL_EFFECT_STATE)).toBe(10);
  });

  it('adds growth bonus (nth mark × pointsPerMark) before multiplying', () => {
    const state = withEffects({ growth: { pointsPerMark: 2, remainingDraws: 10, nthMark: 3 } });
    // base 10 + growth (2 × 3) = 16, no multiplier
    expect(scoreMark({ pointsPerMark: 10 }, state)).toBe(16);
  });

  it('applies the multiplier after growth', () => {
    const state = withEffects({
      growth: { pointsPerMark: 2, remainingDraws: 10, nthMark: 3 },
      multiplier: { factor: 1.5, remainingDraws: 8 },
    });
    // (10 + 6) * 1.5 = 24
    expect(scoreMark({ pointsPerMark: 10 }, state)).toBe(24);
  });
});

describe('scorePattern', () => {
  const cfg = { pointsByKey: { 'rows-1': 100, fullCard: 500 }, firstToPatternBonusPercent: 50 };

  it('returns the catalogue points without the first bonus', () => {
    expect(
      scorePattern(cfg, {
        prizeKey: 'rows-1',
        isFirstInRound: false,
        effects: INITIAL_EFFECT_STATE,
      }),
    ).toBe(100);
  });

  it('adds the first-to-pattern bonus for the first completer', () => {
    expect(
      scorePattern(cfg, {
        prizeKey: 'rows-1',
        isFirstInRound: true,
        effects: INITIAL_EFFECT_STATE,
      }),
    ).toBe(150);
  });

  it('returns 0 for an unknown prize key', () => {
    expect(
      scorePattern(cfg, { prizeKey: 'nope', isFirstInRound: true, effects: INITIAL_EFFECT_STATE }),
    ).toBe(0);
  });

  it('applies the multiplier after the first bonus', () => {
    const effects = withEffects({ multiplier: { factor: 2, remainingDraws: 5 } });
    expect(scorePattern(cfg, { prizeKey: 'rows-1', isFirstInRound: true, effects })).toBe(300);
  });
});

describe('speedBonus', () => {
  const cfg = { maxBonus: 10, windowMs: 1_000 };

  it('is maxBonus at delta 0', () => {
    expect(speedBonus(cfg, 0)).toBe(10);
  });

  it('is 0 at the window boundary', () => {
    expect(speedBonus(cfg, 1_000)).toBe(0);
  });

  it('is 5 at half the window', () => {
    expect(speedBonus(cfg, 500)).toBe(5);
  });

  it('is 0 past the window', () => {
    expect(speedBonus(cfg, 1_500)).toBe(0);
  });

  it('is 0 for a negative delta', () => {
    expect(speedBonus(cfg, -1)).toBe(0);
  });
});
