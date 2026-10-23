/**
 * @file   packages/domain/src/seasons/seasonComplete.ts
 * @module domain/seasons
 * @brief  Season Complete trigger: once per player per match (01 §8.3).
 *
 * Responsibility: given the current bitmask of activated seasons and the "has already
 *                 fired this match" flag, answer whether this season activation is the
 *                 one that triggers Season Complete. Invariant 6 of 12 §3 is enforced
 *                 by the caller tracking that flag.
 * Depends on:     ./effectState
 * Used by:        future match engine, ../index, ../match/markResolver
 * Spec:           docs/spec/01-game-design.md §8.3
 */
import { hasActivatedAllSeasons, type EffectState } from './effectState.js';

export interface SeasonCompleteCfg {
  readonly points: number;
}

export interface SeasonCompleteResult {
  readonly fires: boolean;
  readonly points: number;
}

export function checkSeasonComplete(
  state: EffectState,
  alreadyFired: boolean,
  cfg: SeasonCompleteCfg,
): SeasonCompleteResult {
  if (alreadyFired || !hasActivatedAllSeasons(state)) return { fires: false, points: 0 };
  return { fires: true, points: cfg.points };
}
