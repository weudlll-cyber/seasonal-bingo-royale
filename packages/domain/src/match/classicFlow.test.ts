/**
 * @file   packages/domain/src/match/classicFlow.test.ts
 * @module domain/match
 * @brief  Classic prize flow through the lifecycle: who wins, when the round ends (01 §3a.1).
 *
 * Responsibility: regression tests for the classic round found by RUN-3: a prize goes
 *                 only to the players who complete it on the draw that first completes
 *                 it (never to later completers), every simultaneous completion on that
 *                 draw wins, and the round ends on the draw that awards the last ticked
 *                 prize (12 §3 invariant 12).
 * Depends on:     ../index, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §3a.1, docs/spec/12-testing-strategy.md §3 inv. 12
 */
import { describe, expect, it } from 'vitest';

import { completedPrizeKeys, simulateMatch, type DomainEvent } from '../index.js';
import { classicRuleset, seed } from '../../test/builders.js';

const TICKED = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'];
const CASES = [
  ['classic', 4, 1],
  ['classic', 20, 2],
  ['classicSeasons', 20, 3],
  ['classicSeasons', 100, 4],
] as const;

function run(gameType: 'classic' | 'classicSeasons', players: number, byte: number) {
  return simulateMatch({
    matchId: `flow-${gameType}-${String(players)}`,
    seed: seed(byte),
    gameType,
    ruleset: classicRuleset(),
    playerCount: players,
    tickedPrizes: TICKED,
  }).events;
}

function awardsByPrize(
  events: readonly DomainEvent[],
): Map<string, { draws: Set<number>; ids: Set<string> }> {
  const map = new Map<string, { draws: Set<number>; ids: Set<string> }>();
  for (const e of events) {
    if (e.type !== 'classicPrizeAwarded') continue;
    const entry = map.get(e.prizeKey) ?? { draws: new Set<number>(), ids: new Set<string>() };
    entry.draws.add(e.drawIndex);
    entry.ids.add(e.accountId);
    map.set(e.prizeKey, entry);
  }
  return map;
}

// Accounts whose card has `prize` complete once every mark of draw `drawIndex` landed.
function completersAt(
  events: readonly DomainEvent[],
  drawIndex: number,
  prize: string,
): Set<string> {
  const marks = new Map<string, boolean[]>();
  let draw = -1;
  for (const e of events) {
    if (e.type === 'roundStarted') {
      for (const [id, cards] of Object.entries(e.cardsByPlayer)) {
        marks.set(
          id,
          (cards[0]?.cells ?? []).map((c) => c.kind === 'free'),
        );
      }
    }
    if (e.type === 'drawMade') draw = e.drawIndex;
    if (draw > drawIndex || e.type === 'roundEnded') break;
    if (e.type === 'cellMarked' && e.cardIndex === 0) {
      const m = marks.get(e.accountId);
      if (m !== undefined) m[e.cellIndex] = true;
    }
  }
  return new Set(
    [...marks].filter(([, m]) => completedPrizeKeys(m).includes(prize)).map(([id]) => id),
  );
}

describe('classic prize flow', () => {
  it.each(CASES)('%s/%i: every prize is awarded on one draw only', (gameType, players, byte) => {
    for (const [, award] of awardsByPrize(run(gameType, players, byte))) {
      expect(award.draws.size).toBe(1);
    }
  });

  it.each(CASES)(
    '%s/%i: every simultaneous completer wins, nobody else',
    (gameType, players, byte) => {
      const events = run(gameType, players, byte);
      for (const [prize, award] of awardsByPrize(events)) {
        const [drawIndex] = [...award.draws];
        expect(award.ids).toEqual(completersAt(events, drawIndex ?? -1, prize));
      }
    },
  );

  it.each(CASES)(
    '%s/%i: the round ends on the draw of the last award',
    (gameType, players, byte) => {
      const events = run(gameType, players, byte);
      const lastAward = Math.max(
        ...[...awardsByPrize(events).values()].flatMap((a) => [...a.draws]),
      );
      const draws = events.filter((e) => e.type === 'drawMade');
      const ended = events.find((e) => e.type === 'roundEnded');
      expect(ended?.type === 'roundEnded' ? ended.reason : null).toBe('allPrizesAwarded');
      expect(draws.length - 1).toBe(lastAward);
    },
  );
});
