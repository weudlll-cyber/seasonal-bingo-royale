/**
 * @file   packages/domain/src/scoring/basePoints.ts
 * @module domain/scoring
 * @brief  Base point values for a mark (01 §8.1).
 *
 * Responsibility: expose the configured pointsPerMark and compute the final points of
 *                 a single mark event, applying any active multiplier and growth bonus.
 *                 Growth is applied before the multiplier, matching 01 §8.2.
 * Depends on:     ../seasons/effectState
 * Used by:        future match engine, ../index, ../match/markResolver
 * Spec:           docs/spec/01-game-design.md §8.1, §8.2
 */
import type { EffectState } from '../seasons/effectState.js';

export interface MarkScoring {
  readonly pointsPerMark: number;
}

export function scoreMark(cfg: MarkScoring, effects: EffectState): number {
  const base = cfg.pointsPerMark;
  const growthBonus =
    effects.growth !== null ? effects.growth.pointsPerMark * effects.growth.nthMark : 0;
  const multiplier = effects.multiplier?.factor ?? 1;
  // Order from 01 §8.2: growth is additive, then the multiplier scales the mark total.
  return Math.round((base + growthBonus) * multiplier);
}
