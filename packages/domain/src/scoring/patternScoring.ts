/**
 * @file   packages/domain/src/scoring/patternScoring.ts
 * @module domain/scoring
 * @brief  Points for completing a pattern, incl. first-to-pattern bonus (01 §8.1).
 *
 * Responsibility: look up the configured points of a prize key and add the "first player
 *                 to complete this pattern in the round" bonus when applicable. A pattern
 *                 scores at most once per card per round (invariant 5 of 12 §3) — tracking
 *                 that is the caller's job; this helper just does the arithmetic.
 * Depends on:     ../seasons/effectState
 * Used by:        future match engine
 * Spec:           docs/spec/01-game-design.md §8.1, docs/spec/12-testing-strategy.md §3 invariant 5
 */
import type { EffectState } from '../seasons/effectState.js';

export interface PatternScoringCfg {
  // Points per prize key (built-in catalogue plus any custom patterns from the ruleset).
  readonly pointsByKey: Readonly<Record<string, number>>;
  readonly firstToPatternBonusPercent: number;
}

export interface PatternScoreInput {
  readonly prizeKey: string;
  readonly isFirstInRound: boolean;
  readonly effects: EffectState;
}

export function scorePattern(cfg: PatternScoringCfg, input: PatternScoreInput): number {
  const base = cfg.pointsByKey[input.prizeKey] ?? 0;
  const withFirst =
    input.isFirstInRound && base > 0
      ? base + Math.round((base * cfg.firstToPatternBonusPercent) / 100)
      : base;
  const multiplier = input.effects.multiplier?.factor ?? 1;
  return Math.round(withFirst * multiplier);
}
