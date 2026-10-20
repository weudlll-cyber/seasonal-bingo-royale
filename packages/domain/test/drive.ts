/**
 * @file   packages/domain/test/drive.ts
 * @module domain/test
 * @brief  Drive the match aggregate by hand in tests: one command, one draw in time order.
 *
 * Responsibility: `play` folds one command's events into the state; `drawAndClose`
 *                 plays a draw the way the scheduler does — the draw, the close of its
 *                 speed window, then the round-end check (01 §6, D10).
 * Depends on:     ../src/index
 * Used by:        packages/domain/src/match/*.test.ts
 * Spec:           docs/spec/12-testing-strategy.md §7
 */
import { decide, evolve, type Command, type DomainEvent, type MatchState } from '../src/index.js';

export function play(
  state: MatchState,
  command: Command,
): { state: MatchState; events: DomainEvent[] } {
  const events = [...decide(state, command, { now: 0 })];
  return { state: events.reduce(evolve, state), events };
}

export function drawAndClose(start: MatchState): MatchState {
  let state = play(start, { type: 'drawNext' }).state;
  const drawIndex = (state.currentRound?.draws.length ?? 0) - 1;
  state = play(state, { type: 'closeSpeedWindow', drawIndex }).state;
  return play(state, { type: 'endRound' }).state;
}
