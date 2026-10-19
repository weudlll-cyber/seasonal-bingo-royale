/**
 * @file   packages/domain/src/seasons/tickEffects.ts
 * @module domain/seasons
 * @brief  Advance active effects by one draw and reset per-draw counters (01 §8.2).
 *
 * Responsibility: `onDraw` decrements the remaining-draws counters of multiplier and
 *                 growth, drops expired entries and bumps growth's `nthMark` so the
 *                 next mark inside the window gets a larger bonus. `onMark` is a
 *                 companion the match engine calls after each mark during a growth
 *                 window.
 * Depends on:     ./effectState
 * Used by:        future match engine
 * Spec:           docs/spec/01-game-design.md §8.2 (durations never negative; non-stacking)
 */
import type { EffectState, GrowthState, MultiplierState } from './effectState.js';

export function onDraw(state: EffectState): EffectState {
  return {
    ...state,
    multiplier: decayMultiplier(state.multiplier),
    growth: decayGrowth(state.growth),
  };
}

export function onMarkInsideGrowth(state: EffectState): EffectState {
  if (state.growth === null) return state;
  return { ...state, growth: { ...state.growth, nthMark: state.growth.nthMark + 1 } };
}

export function consumeShield(state: EffectState): EffectState {
  if (state.shieldCharges <= 0) return state;
  return { ...state, shieldCharges: state.shieldCharges - 1 };
}

function decayMultiplier(m: MultiplierState | null): MultiplierState | null {
  if (m === null) return null;
  const next = m.remainingDraws - 1;
  return next > 0 ? { ...m, remainingDraws: next } : null;
}

function decayGrowth(g: GrowthState | null): GrowthState | null {
  if (g === null) return null;
  const next = g.remainingDraws - 1;
  return next > 0 ? { ...g, remainingDraws: next } : null;
}
