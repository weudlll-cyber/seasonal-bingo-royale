/**
 * @file   packages/domain/src/scoring/basePoints.ts
 * @module domain/scoring
 * @brief  Base point values for a mark (01 §8.1).
 *
 * Responsibility: expose the configured pointsPerMark and compute the final points of
 *                 a single mark event: base, growth bonus and the tap's speed bonus, all
 *                 multiplied by an active Summer boost (D44, 01 §8.2).
 * Depends on:     ../seasons/effectState
 * Used by:        future match engine, ../index, ../match/markResolver
 * Spec:           docs/spec/01-game-design.md §8.1, §8.2
 */
import type { EffectState } from '../seasons/effectState.js';

export interface MarkScoring {
  readonly pointsPerMark: number;
}

export function scoreMark(cfg: MarkScoring, effects: EffectState, speedBonus = 0): number {
  const base = cfg.pointsPerMark;
  // nthMark further marks are made; this one is the next: +1×, +2×, +3× … (01 §8.2).
  const growthBonus =
    effects.growth !== null ? effects.growth.pointsPerMark * (effects.growth.nthMark + 1) : 0;
  const multiplier = effects.multiplier?.factor ?? 1;
  // Growth and the speed bonus add to the mark, then the boost scales it all (D44).
  return Math.round((base + growthBonus + speedBonus) * multiplier);
}
