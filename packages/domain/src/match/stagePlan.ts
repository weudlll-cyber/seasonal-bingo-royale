/**
 * @file   packages/domain/src/match/stagePlan.ts
 * @module domain/match
 * @brief  Build the stage plan the match lifecycle advances through (01 §3a, §7.1).
 *
 * Responsibility: for royale, the plan is a copy of the ruleset `stages` array; for
 *                 classicSeasons and classic the plan is a single pseudo-stage carrying
 *                 the round-end condition "allPrizesAwarded or poolExhausted" and no
 *                 cut, so the same lifecycle code runs both game types.
 * Depends on:     ./lifecycleTypes, ../gameType
 * Used by:        ./decide
 * Spec:           docs/spec/01-game-design.md §3a, §7.1
 */
import type { GameType } from '../gameType.js';
import type { MatchRuleset, StagePlanEntry } from './lifecycleTypes.js';

export function buildStagePlan(
  gameType: GameType,
  ruleset: MatchRuleset,
): readonly StagePlanEntry[] {
  if (gameType === 'royale') return ruleset.stages;
  // Both classic game types ignore ruleset.stages and run one pseudo-stage. The
  // round-end condition is marked with firstFullHouse here only as a placeholder;
  // decide/endRound uses the classic-specific "all prizes awarded" check instead.
  const stage: StagePlanEntry = {
    kind: 'final',
    rounds: 1,
    roundEnd: { kind: 'firstFullHouse' },
    scoreCarry: { kind: 'reset' },
    stageMultiplier: 1,
    activePatterns: [],
  };
  return [stage];
}
