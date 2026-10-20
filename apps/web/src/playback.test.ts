/**
 * @file   apps/web/src/playback.test.ts
 * @module web
 * @brief  Unit tests for the playback view-model (WP-08).
 *
 * Responsibility: each round shows that round's cards with fresh marks; a cut records
 *                 the owner's outcome and marks the owner as out while the match goes
 *                 on; the owner's status is the latest server entry at the current step.
 * Depends on:     ./playback, ./quickTestFixture
 * Spec:           docs/spec/01-game-design.md §7, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { playbackAt } from './playback.js';
import { numberCard, royaleFixture } from './quickTestFixture.js';

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
    const view = playbackAt(result, 9);
    expect(view.lastCut).toEqual({
      number: 1,
      owners: [{ accountId: 'owner-01', outcome: 'eliminated' }],
    });
    expect(view.owners[0]?.eliminated).toBe(true);
    const end = playbackAt(result, result.events.length);
    expect(end.finished).toBe(true);
    expect(end.drawsSoFar).toEqual([4]);
  });

  it("deals each round's cards with fresh marks", () => {
    const view = playbackAt(result, 12);
    const bot = view.standings.find((p) => p.accountId === 'bot-02');
    expect(bot?.cards[0]).toEqual(numberCard(3));
    expect(bot?.marks[0]?.filter(Boolean)).toHaveLength(1); // only the free centre
    expect(bot?.points).toBe(30); // points carry over; marks do not
  });
});
