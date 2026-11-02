/**
 * @file   packages/domain/src/match/finalWinner.test.ts
 * @module domain/match
 * @brief  Through a recorded final: the player whose full card ended it is 1st (01 §7.5).
 *
 * Responsibility: replay a simulated royale up to the end of its final round, give another
 *                 finalist more points than the full card's owner (as Season Complete and a
 *                 jackpot could), and let `decide` finish the match: the full card's owner is
 *                 place 1, the richer finalist place 2, and every eliminated player stays
 *                 below every finalist.
 * Depends on:     ../index, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4
 */
import { describe, expect, it } from 'vitest';

import {
  createInitialMatchState,
  decide,
  evolve,
  simulateMatch,
  type MatchState,
} from '../index.js';
import { royaleRuleset, seed } from '../../test/builders.js';

// The match state just before its matchFinished event.
function beforeFinish(): MatchState {
  const sim = simulateMatch({
    matchId: 'final-winner',
    seed: seed(7),
    gameType: 'royale',
    ruleset: royaleRuleset(),
    playerCount: 8,
    tickedPrizes: [],
  });
  let state = createInitialMatchState();
  for (const ev of sim.events) {
    if (ev.type === 'matchFinished') break;
    state = evolve(state, ev);
  }
  return state;
}

describe('the final winner is 1st (01 §7.5)', () => {
  it('places the full card above a finalist with more points', () => {
    const state = beforeFinish();
    const cards = state.currentRound?.cards ?? {};
    const winner = Object.keys(cards).find((id) =>
      cards[id]?.some((c) => c.scoredPrizes.includes('fullCard')),
    );
    const finalists = state.playerOrder.filter(
      (id) => state.players[id]?.eliminatedAtRound === null,
    );
    const rich = finalists.find((id) => id !== winner) ?? '';
    const winnerPoints = state.players[winner ?? '']?.points ?? 0;
    const richPlayer = state.players[rich];
    if (richPlayer === undefined) throw new Error('no second finalist');
    const richer: MatchState = {
      ...state,
      players: { ...state.players, [rich]: { ...richPlayer, points: winnerPoints + 500 } },
    };
    const [finished] = decide(richer, { type: 'finishMatch' }, { now: 0 });
    if (finished?.type !== 'matchFinished') throw new Error('no finish');
    const order = finished.placement.map((p) => p.accountId);
    expect(order.slice(0, 2)).toEqual([winner, rich]);
    expect(order.slice(0, finalists.length).sort()).toEqual([...finalists].sort());
  });
});
