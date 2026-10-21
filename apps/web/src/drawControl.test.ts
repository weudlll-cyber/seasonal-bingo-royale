/**
 * @file   apps/web/src/drawControl.test.ts
 * @module web
 * @brief  One draw per step, including a round's last draw (acceptance play-through).
 *
 * Responsibility: nextStep reveals exactly one draw with everything that belongs to it —
 *                 marks, round end, cut — but stops before the next stage or round, so the
 *                 round's last number is shown with the old card before the next round
 *                 deals new cards; the following step shows the new round and its first
 *                 number together.
 * Depends on:     ./drawControl, ./types
 * Spec:           docs/spec/01-game-design.md §5; docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { firstStep, nextStep } from './drawControl.js';
import type { DomainEventLike } from './types.js';

const ev = (type: string, extra: Record<string, unknown> = {}): DomainEventLike =>
  ({ type, ...extra }) as unknown as DomainEventLike;

// Round 1 with two draws, a cut, stage 2 with round 2 and one draw, then the end.
const EVENTS: readonly DomainEventLike[] = [
  ev('stageStarted', { stageIndex: 0 }), // 0
  ev('roundStarted', { roundIndex: 0 }), // 1
  ev('drawMade', { drawIndex: 0, item: 5 }), // 2
  ev('cellMarked'), // 3
  ev('drawMade', { drawIndex: 1, item: 9 }), // 4: the round's last draw
  ev('cellMarked'), // 5
  ev('roundEnded', { roundIndex: 0 }), // 6
  ev('cutApplied'), // 7
  ev('stageStarted', { stageIndex: 1 }), // 8
  ev('roundStarted', { roundIndex: 1 }), // 9
  ev('drawMade', { drawIndex: 0, item: 40 }), // 10
  ev('cellMarked'), // 11
  ev('roundEnded', { roundIndex: 1 }), // 12
  ev('matchFinished'), // 13
];

describe('nextStep', () => {
  it('shows the cards before the first draw, then one draw per step', () => {
    expect(firstStep(EVENTS)).toBe(2);
    expect(nextStep(EVENTS, 2)).toBe(4);
  });

  it("shows a round's last draw with its round end and cut, before the next round", () => {
    expect(nextStep(EVENTS, 4)).toBe(8);
  });

  it('shows the next stage, round and its first draw together, then the match end', () => {
    expect(nextStep(EVENTS, 8)).toBe(EVENTS.length);
  });
});
