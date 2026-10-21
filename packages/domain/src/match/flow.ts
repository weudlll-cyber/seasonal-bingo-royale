/**
 * @file   packages/domain/src/match/flow.ts
 * @module domain/match
 * @brief  What a match does next once a stage has started or a round (and its cut) is over.
 *
 * Responsibility: one rule for the simulator and the live match engine: play another
 *                 round of the current stage while rounds remain, unless an elimination
 *                 stage finds the field already at final size (01 §7.4); otherwise start
 *                 the next stage, or finish the match after the last one. Pure.
 * Depends on:     ./matchState
 * Used by:        ./simulate, packages/application (match engine)
 * Spec:           docs/spec/01-game-design.md §7.1, §7.4
 */
import type { MatchState } from './matchState.js';

export type NextStep = 'startRound' | 'startStage' | 'finish';

export function nextStep(state: MatchState): NextStep {
  const stage = state.stagePlan[state.stageIndex];
  if (stage === undefined) return 'finish';
  const skip = stage.kind === 'elimination' && fieldAtFinalSize(state);
  if (!skip && state.roundInStage < stage.rounds) return 'startRound';
  return state.stageIndex + 1 < state.stagePlan.length ? 'startStage' : 'finish';
}

// No explicit "final size" is defined (01 §7.4); the final stage's minimum survivors
// (default 2) stands in for it, so a cut never goes below it.
function fieldAtFinalSize(state: MatchState): boolean {
  const finalStage = state.stagePlan[state.stagePlan.length - 1];
  if (finalStage === undefined || finalStage.kind !== 'final') return false;
  const active = state.playerOrder.filter(
    (id) => state.players[id]?.eliminatedAtRound === null,
  ).length;
  return active <= (finalStage.cut?.minSurvivors ?? 2);
}
