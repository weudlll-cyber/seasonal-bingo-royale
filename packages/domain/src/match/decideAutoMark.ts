/**
 * @file   packages/domain/src/match/decideAutoMark.ts
 * @module domain/match
 * @brief  Auto-mark projection for `drawNext` and `closeSpeedWindow` (01 §6).
 *
 * Responsibility: after a draw is appended to the round, visit every active player's
 *                 cards and emit the mark events for every cell that matches the drawn
 *                 item. Each produced event is folded through evolve so successive
 *                 marks for the same draw see the growing effect/scored-prizes state.
 *                 Pure.
 * Depends on:     ../card/cardTypes, ./evolve, ./markResolver, ./matchState, ./events
 * Used by:        ./decide
 * Spec:           docs/spec/01-game-design.md §6
 */
import type { Cell } from '../card/cardTypes.js';
import { evolve } from './evolve.js';
import { buildMarkEvents } from './markResolver.js';
import type { MatchState } from './matchState.js';
import type { DomainEvent } from './events.js';

interface Scope {
  readonly accountId: string;
  readonly cardIndex: number;
  readonly item: number;
}

export function autoMarksForItem(
  state: MatchState,
  item: number,
): {
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
} {
  if (state.currentRound === null) return { events: [], state };
  const output: DomainEvent[] = [];
  let working = state;
  for (const accountId of state.playerOrder) {
    working = runPlayerAutoMarks(working, { accountId, cardIndex: -1, item }, output);
  }
  return { events: output, state: working };
}

function runPlayerAutoMarks(state: MatchState, scope: Scope, output: DomainEvent[]): MatchState {
  const player = state.players[scope.accountId];
  if (player === undefined || player.eliminatedAtRound !== null) return state;
  const cards = state.currentRound?.cards[scope.accountId];
  if (cards === undefined) return state;
  let working = state;
  for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
    working = runCardAutoMarks(working, { ...scope, cardIndex }, output);
  }
  return working;
}

function runCardAutoMarks(state: MatchState, scope: Scope, output: DomainEvent[]): MatchState {
  const cards = state.currentRound?.cards[scope.accountId];
  const target = cards?.[scope.cardIndex];
  if (target === undefined) return state;
  let working = state;
  target.card.cells.forEach((cell, cellIndex) => {
    if (!cellMatches(cell, scope.item)) return;
    const current = working.currentRound?.cards[scope.accountId]?.[scope.cardIndex];
    if (current === undefined || current.marks[cellIndex] === true) return;
    const marks = buildMarkEvents(working, {
      accountId: scope.accountId,
      cardIndex: scope.cardIndex,
      cellIndex,
      inSpeedWindow: false,
      speedBonus: 0,
    });
    for (const ev of marks) {
      output.push(ev);
      working = evolve(working, ev);
    }
  });
  return working;
}

function cellMatches(cell: Cell, item: number): boolean {
  if (cell.kind === 'free') return false;
  return cell.value === item;
}
