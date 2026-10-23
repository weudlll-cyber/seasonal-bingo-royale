/**
 * @file   packages/domain/src/seasons/effectState.ts
 * @module domain/seasons
 * @brief  Per-player active effect state and the non-stacking refresh rule (01 §8.2).
 *
 * Responsibility: track the state the match engine updates after each draw or season
 *                 activation. One multiplier, one growth window, a per-match shield
 *                 counter, and a bit flag per season for Season Complete. "Effects of
 *                 the same type do not stack" is enforced by overwriting the existing
 *                 entry on refresh.
 * Depends on:     ../draw/pool (SeasonName)
 * Used by:        ./applyEffect, ./tickEffects, ../scoring/*, ./seasonComplete, ../index,
 *                 ../match/markResolver, ../match/matchState
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3
 */
import type { SeasonName } from '../draw/pool.js';

export interface MultiplierState {
  readonly factor: number;
  readonly remainingDraws: number;
}

export interface GrowthState {
  readonly pointsPerMark: number;
  readonly remainingDraws: number;
  // How many marks have landed since the growth started; the bonus is
  // nthMark * pointsPerMark on the next mark (01 §8.2 "+1x, +2x, +3x …").
  readonly nthMark: number;
}

export type SeasonsBitmask = number; // 4 low bits, in SeasonName order.

export interface EffectState {
  readonly multiplier: MultiplierState | null;
  readonly growth: GrowthState | null;
  readonly shieldCharges: number;
  readonly seasonsActivated: SeasonsBitmask;
  // Count of pending "reveal next" tickets a UI will consume to show not-on-card numbers.
  readonly revealTickets: number;
}

export const INITIAL_EFFECT_STATE: EffectState = Object.freeze({
  multiplier: null,
  growth: null,
  shieldCharges: 0,
  seasonsActivated: 0,
  revealTickets: 0,
});

const SEASON_BIT: Readonly<Record<SeasonName, number>> = Object.freeze({
  spring: 1,
  summer: 2,
  autumn: 4,
  winter: 8,
});

export function markSeasonActivated(state: EffectState, season: SeasonName): EffectState {
  return { ...state, seasonsActivated: state.seasonsActivated | SEASON_BIT[season] };
}

export function hasActivatedAllSeasons(state: EffectState): boolean {
  return state.seasonsActivated === 15;
}
