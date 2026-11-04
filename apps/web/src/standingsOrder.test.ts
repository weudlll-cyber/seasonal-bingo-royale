/**
 * @file   apps/web/src/standingsOrder.test.ts
 * @module web
 * @brief  The live standings' order: players out in the same cut as the server ranked them.
 *
 * Responsibility: players still in come first by points; players out follow, the latest cut
 *                 first; two players out in the same cut with equal points keep the server's
 *                 order of that cut (the tie-break chain of 01 §8.4), not the account id, so
 *                 the live rank and the final placement agree; players still in with equal
 *                 points follow the server's ranking of them (`rankedIn`).
 * Depends on:     vitest, ./standingsOrder, ./playbackTypes (types)
 * Spec:           docs/spec/01-game-design.md §7.5, §8.4, §13
 */
import { describe, expect, it } from 'vitest';

import type { PlayerView } from './playbackTypes.js';
import { standingsOrder } from './standingsOrder.js';

function player(accountId: string, over: Partial<PlayerView> = {}): PlayerView {
  return {
    accountId,
    isOwner: false,
    cards: [],
    marks: [],
    points: 90,
    seasonsActivated: 0,
    seasons: [],
    eliminated: false,
    eliminatedRound: null,
    eliminatedCut: null,
    outPoints: null,
    outRank: null,
    shieldSaves: [],
    ...over,
  };
}

describe('the live standings order', () => {
  it('keeps the server order of a cut for players out with equal points', () => {
    const out = { eliminated: true, eliminatedRound: 1, eliminatedCut: 2 };
    // The server ranked the owner (more seasons) above bot-06 in that cut.
    const owner = player('fd94d682', { ...out, outRank: 0, seasonsActivated: 2 });
    const bot = player('bot-06', { ...out, outRank: 1, seasonsActivated: 1 });
    const earlier = player('bot-03', {
      eliminated: true,
      eliminatedRound: 0,
      eliminatedCut: 1,
      outRank: 0,
      points: 40,
    });
    const still = player('bot-05', { points: 0 });
    const order = [bot, earlier, still, owner].sort(standingsOrder()).map((p) => p.accountId);
    expect(order).toEqual(['bot-05', 'fd94d682', 'bot-06', 'bot-03']);
  });

  it('orders players still in with equal points as the server ranks them (01 §8.4)', () => {
    const me = player('dev-player-1', { points: 0 });
    const bots = ['bot-02', 'bot-03', 'bot-06'].map((id) => player(id, { points: 0 }));
    const leader = player('bot-04', { points: 20 });
    // The server's order of the players still in: the leader, then the earlier join first.
    const rankedIn = ['bot-04', 'dev-player-1', 'bot-02', 'bot-03', 'bot-06'];
    const order = [...bots, me, leader].sort(standingsOrder(rankedIn)).map((p) => p.accountId);
    expect(order).toEqual(rankedIn);
  });
});
