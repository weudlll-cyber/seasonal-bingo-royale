/**
 * @file   apps/web/src/playback.test.ts
 * @module web
 * @brief  Unit tests for the playback view-model (WP-08).
 *
 * Responsibility: each round shows that round's cards with fresh marks; a cut records
 *                 the owner's outcome and marks the owner as out while the match goes
 *                 on; the owner's status is the latest server entry at the current step.
 * Depends on:     ./playback, ./test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { playbackAt } from './playback.js';
import { numberCard, royaleFixture } from './test/quickTestFixture.js';

const result = royaleFixture();

describe('playbackAt', () => {
  it('follows the events: marks, points and the owner status at the current step', () => {
    const view = playbackAt(result, 6);
    const owner = view.owners[0];
    expect(owner?.marks[0]?.[0]).toBe(true);
    expect(owner?.points).toBe(10);
    expect(view.ownerStatus['owner-01']?.seasons).toEqual(['spring']);
    expect(playbackAt(result, 5).ownerStatus['owner-01']?.seasons).toEqual([]);
  });

  it('records the owner as eliminated at the cut and keeps the match going', () => {
    const view = playbackAt(result, 11);
    expect(view.lastCut).toEqual({
      number: 1,
      owners: [{ accountId: 'owner-01', outcome: 'eliminated' }],
    });
    expect(view.owners[0]?.eliminated).toBe(true);
    const end = playbackAt(result, result.events.length);
    expect(end.finished).toBe(true);
    expect(end.drawsSoFar).toEqual([4]);
  });

  it('lists players still in the match first, eliminated players after them', () => {
    // After the cut: owner-01 (10 pts) is out; bot-03 (0 pts) is still in.
    const order = playbackAt(result, 11).standings.map((p) => p.accountId);
    expect(order).toEqual(['bot-02', 'bot-03', 'owner-01']);
  });

  it('ranks the later eliminated above the earlier, whatever their points', () => {
    // bot-03 (0 pts) goes out in round 2, after owner-01 (10 pts) went out in round 1.
    const cut = {
      type: 'cutApplied' as const,
      stageIndex: 1,
      survivors: ['bot-02'],
      eliminated: ['bot-03'],
      shieldSaves: [],
    };
    const events = [...result.events.slice(0, 13), cut];
    const order = playbackAt({ ...result, events }, events.length).standings.map(
      (p) => p.accountId,
    );
    expect(order).toEqual(['bot-02', 'bot-03', 'owner-01']);
  });

  it("deals each round's cards with fresh marks", () => {
    const view = playbackAt(result, 13);
    const bot = view.standings.find((p) => p.accountId === 'bot-02');
    expect(bot?.cards[0]).toEqual(numberCard(3));
    expect(bot?.marks[0]?.filter(Boolean)).toHaveLength(1); // only the free centre
  });

  it("takes the server's points as the baseline at every stage start (score carry)", () => {
    const bot = (step: number) =>
      playbackAt(result, step).standings.find((p) => p.accountId === 'bot-02');
    expect(bot(11)?.points).toBe(30);
    expect(bot(12)?.points).toBe(0); // the final stage resets points
  });
});
