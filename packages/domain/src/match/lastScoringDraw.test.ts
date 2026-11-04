/**
 * @file   packages/domain/src/match/lastScoringDraw.test.ts
 * @module domain/match
 * @brief  "Last scoring draw" in the tie-break counts the match's draws, not the round's (audit-3 G5).
 *
 * Responsibility: player a scores last on draw 30 of round 1, player b on draw 5 of round 2
 *                 (the match's draw 45 after round 1's 40): b's last scoring draw is the later
 *                 one, so with everything else equal a ranks above b (01 §8.4, earlier first).
 *                 Counted per round, b's 5 came before a's 30 and b ranked above.
 * Depends on:     vitest, ../index, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §8.4
 */
import { describe, expect, it } from 'vitest';

import { byTieBreak, createInitialMatchState, evolve, type DomainEvent } from '../index.js';
import { royaleRuleset } from '../../test/builders.js';

const RULESET = royaleRuleset();
const CARD = {
  cells: Array.from({ length: 25 }, (_v, i) =>
    i === 12 ? { kind: 'free' as const } : { kind: 'number' as const, value: i + 1 },
  ),
  seasonCells: null,
};

const roundStarted = (roundIndex: number): DomainEvent => ({
  type: 'roundStarted',
  roundIndex,
  stageIndex: 0,
  roundInStage: roundIndex,
  drawSequence: Array.from({ length: 75 }, (_v, i) => i + 1),
  cardsByPlayer: { a: [CARD], b: [CARD] },
});
const draws = (count: number): DomainEvent[] =>
  Array.from({ length: count }, (_v, drawIndex) => ({
    type: 'drawMade' as const,
    drawIndex,
    item: drawIndex + 1,
  }));
const marked = (accountId: string, cellIndex: number): DomainEvent => ({
  type: 'cellMarked',
  accountId,
  cardIndex: 0,
  cellIndex,
  markPoints: 10,
});

describe('the last scoring draw (01 §8.4)', () => {
  it('counts the draws of the whole match', () => {
    const events: DomainEvent[] = [
      {
        type: 'lobbyOpened',
        matchId: 'm',
        gameType: 'royale',
        ruleset: RULESET,
        seed: new Uint8Array(32),
        stagePlan: RULESET.stages,
        tickedPrizes: [],
      },
      { type: 'playerJoined', accountId: 'a', joinedAt: 0 },
      { type: 'playerJoined', accountId: 'b', joinedAt: 1 },
      { type: 'matchStarted' },
      { type: 'stageStarted', stageIndex: 0 },
      roundStarted(0),
      ...draws(31),
      marked('a', 0),
      ...draws(40).slice(31),
      { type: 'roundEnded', roundIndex: 0, reason: 'drawCount' },
      roundStarted(1),
      ...draws(6),
      marked('b', 0),
    ];
    const state = events.reduce(evolve, createInitialMatchState());
    const a = state.players['a'];
    const b = state.players['b'];
    expect(a?.lastScoringDraw).toBe(30);
    expect(b?.lastScoringDraw).toBe(45);
    const candidate = (id: string, lastScoringDraw: number | null) => ({
      accountId: id,
      points: 10,
      patterns: 0,
      seasonsActivated: 0,
      lastScoringDraw,
      joinedAt: id === 'a' ? 1 : 0,
    });
    const ranked = [
      candidate('b', b?.lastScoringDraw ?? null),
      candidate('a', a?.lastScoringDraw ?? null),
    ].sort(byTieBreak);
    expect(ranked.map((c) => c.accountId)).toEqual(['a', 'b']);
  });
});
