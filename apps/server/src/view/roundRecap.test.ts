/**
 * @file   apps/server/src/view/roundRecap.test.ts
 * @module server/view
 * @brief  The royale round recap (D20): every item, its ties and its empty case.
 *
 * Responsibility: hand-made event logs (players a–j, one card each with the numbers 1–25)
 *                 check the top three by points scored in the round (ties by the place
 *                 after it, places tie-broken as the cut does, no one who scored nothing), the biggest climber (ties by points
 *                 in the round, none when nobody gained), the cut (count, at most 8 names,
 *                 shield saves; left out without a cut or when it changed nothing), Season
 *                 Complete, the fastest tapper (own taps inside the speed window, at least
 *                 5, ties by more taps), the facts, a second round measured from its own
 *                 start, and no recap before the round has ended.
 * Depends on:     vitest, @sbr/application (ruleset), @sbr/domain (types), ./roundRecap
 * Spec:           docs/spec/01-game-design.md §7 (D20)
 */
import { defaultRulesetFor, toMatchRuleset } from '@sbr/application';
import type { Card, DomainEvent } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { buildRoundRecap, type TimedEvent } from './roundRecap.js';

const RULESET = toMatchRuleset(defaultRulesetFor('royale'), 'manual', { kind: 'noAutoMark' });
const WINDOW = 3_000;
// Cell i holds the number i + 1; the centre (12) is free.
const CARD: Card = {
  cells: Array.from({ length: 25 }, (_v, i) =>
    i === 12 ? { kind: 'free' as const } : { kind: 'number' as const, value: i + 1 },
  ),
  seasonCells: null,
};
const cellOf = (item: number): number => item - 1;

function opened(ids: readonly string[]): TimedEvent[] {
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
    ...ids.map((id, i) => ({
      type: 'playerJoined' as const,
      accountId: id,
      joinedAt: i,
      human: true,
    })),
    { type: 'matchStarted' },
    { type: 'stageStarted', stageIndex: 0 },
  ];
  return events.map((event) => ({ event }));
}

function roundStart(roundIndex: number, ids: readonly string[]): TimedEvent {
  return {
    event: {
      type: 'roundStarted',
      roundIndex,
      stageIndex: 0,
      roundInStage: roundIndex,
      drawSequence: Array.from({ length: 75 }, (_v, i) => i + 1),
      cardsByPlayer: Object.fromEntries(ids.map((id) => [id, [CARD]])),
    },
  };
}

const draw = (drawIndex: number, at?: number): TimedEvent => ({
  event: { type: 'drawMade', drawIndex, item: drawIndex + 1 },
  ...(at === undefined ? {} : { at }),
});
const mark = (id: string, item: number, points: number, at?: number): TimedEvent => ({
  event: {
    type: 'cellMarked',
    accountId: id,
    cardIndex: 0,
    cellIndex: cellOf(item),
    markPoints: points,
  },
  ...(at === undefined ? {} : { at }),
});
const ended = (roundIndex: number): TimedEvent => ({
  event: { type: 'roundEnded', roundIndex, reason: 'drawCount' },
});
const cut = (
  survivors: string[],
  eliminated: string[],
  shieldSaves: string[] = [],
): TimedEvent => ({
  event: { type: 'cutApplied', stageIndex: 0, survivors, eliminated, shieldSaves },
});

const names = new Map<string, string>();
const recap = (events: TimedEvent[], roundIndex = 0, manualTaps?: ReadonlySet<string>) =>
  buildRoundRecap({
    events,
    roundIndex,
    idMap: names,
    speedWindowMs: WINDOW,
    ...(manualTaps === undefined ? {} : { manualTaps }),
  });

describe('round recap: ties in the standings (D20, 01 §8.4)', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('ranks as the cut does (01 §8.4), not by join order', () => {
    // b and c tie on 20; c scored on an earlier draw, so c ranks above b (who joined first).
    const log = [
      ...opened(ids),
      roundStart(0, ids),
      draw(0),
      mark('c', 1, 20),
      draw(1),
      mark('b', 2, 20),
      ended(0),
    ];
    expect(recap(log)?.top).toEqual([
      { name: 'c', points: 20 },
      { name: 'b', points: 20 },
    ]);
    expect(recap(log)?.climber).toEqual({ name: 'c', from: 3, to: 1 });
  });
});

describe('round recap: top three and climber (D20)', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('lists who scored most in the round, ties by the place after it, never a zero', () => {
    const log = [
      ...opened(ids),
      roundStart(0, ids),
      draw(0),
      mark('d', 1, 30),
      mark('b', 1, 20),
      mark('c', 1, 20),
      ended(0),
    ];
    // b and c tie on 20; b joined first, so b is placed above c.
    expect(recap(log)?.top).toEqual([
      { name: 'd', points: 30 },
      { name: 'b', points: 20 },
      { name: 'c', points: 20 },
    ]);
    expect(recap([...opened(ids), roundStart(0, ids), draw(0), ended(0)])?.top).toBeUndefined();
  });

  it('names the biggest climber, ties by points in the round; none when nobody gained', () => {
    const round0 = [
      roundStart(0, ids),
      draw(0),
      mark('a', 1, 40),
      mark('b', 1, 30),
      mark('c', 1, 20),
      mark('d', 1, 5),
      ended(0),
    ];
    // Round 1: d climbs from 4th to 1st, c from 3rd to 2nd.
    const round1 = [roundStart(1, ids), draw(0), mark('d', 1, 100), mark('c', 1, 50), ended(1)];
    const log = [...opened(ids), ...round0, ...round1];
    expect(recap(log, 1)?.climber).toEqual({ name: 'd', from: 4, to: 1 });
    // The second round is measured from its own start: d scored 100 in it, not 105.
    expect(recap(log, 1)?.top?.[0]).toEqual({ name: 'd', points: 100 });
    // Round 0 from a 4-way tie (join order a, b, c, d) to the same order: nobody gained.
    expect(recap(log, 0)?.climber).toBeUndefined();
    // Two players gain two places each: the one with more points in the round wins.
    const tie = [roundStart(0, ids), draw(0), mark('c', 1, 10), mark('d', 1, 20), ended(0)];
    expect(recap([...opened(ids), ...tie])?.climber).toEqual({ name: 'd', from: 4, to: 1 });
  });
});

describe('round recap: cut, Season Complete and facts (D20)', () => {
  const ten = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

  it('reports the cut: how many are out, at most eight names, shield saves, players left', () => {
    const out = ten.slice(1);
    const log = [
      ...opened(ten),
      roundStart(0, ten),
      draw(0),
      draw(1),
      ended(0),
      cut(['a'], out, ['a']),
    ];
    const r = recap(log);
    expect(r?.cut).toEqual({ outCount: 9, out: out.slice(0, 8), saved: ['a'] });
    expect(r?.facts).toEqual({ numbersDrawn: 2, playersLeft: 1 });
  });

  it('leaves the cut out when there was none or it changed nothing', () => {
    const base = [...opened(ten), roundStart(0, ten), draw(0), ended(0)];
    expect(recap(base)?.cut).toBeUndefined();
    expect(recap(base)?.facts).toEqual({ numbersDrawn: 1, playersLeft: 10 });
    expect(recap([...base, cut(ten, [])])?.cut).toBeUndefined();
  });

  it('names who completed all four seasons in the round, and nobody else', () => {
    const complete: TimedEvent = {
      event: { type: 'seasonCompleteFired', accountId: 'c', points: 300 },
    };
    const log = [...opened(ten), roundStart(0, ten), draw(0), complete, ended(0)];
    expect(recap(log)?.seasonComplete).toEqual(['c']);
    expect(
      recap([...opened(ten), roundStart(0, ten), draw(0), ended(0)])?.seasonComplete,
    ).toBeUndefined();
  });

  it('has no recap before the round has ended', () => {
    expect(recap([...opened(ten), roundStart(0, ten), draw(0)])).toBeNull();
  });
});

// Draw n at 10 s × n; a player taps number n + 1 `delay` ms after it.
const taps = (id: string, delays: readonly number[]): TimedEvent[] =>
  delays.map((delay, n) => mark(id, n + 1, 10, n * 10_000 + delay));
const draws = Array.from({ length: 6 }, (_v, n) => draw(n, n * 10_000));
const own = (entries: readonly [string, number][]) =>
  new Set(
    entries.flatMap(([id, count]) =>
      Array.from({ length: count }, (_v, n) => `${id}:0:${String(cellOf(n + 1))}`),
    ),
  );

describe('round recap: fastest tapper (D20)', () => {
  const ids = ['a', 'b', 'c'];
  it('picks the lowest average over at least five own taps inside the window', () => {
    const log = [
      ...opened(ids),
      roundStart(0, ids),
      ...draws,
      ...taps('a', [900, 900, 900, 900, 900]),
      ...taps('b', [700, 800, 900, 700, 900, 800]),
      // c taps faster but only four times inside the window (the fifth is late).
      ...taps('c', [100, 100, 100, 100, 3_500]),
      ended(0),
    ];
    const r = recap(
      log,
      0,
      own([
        ['a', 5],
        ['b', 6],
        ['c', 5],
      ]),
    );
    // Counting c's late tap would make c the fastest (average 780 ms).
    expect(r?.fastest).toEqual({ name: 'b', averageMs: 800, taps: 6 });
  });

  it("ignores marks that are not the player's own taps, and leaves the item out", () => {
    const log = [
      ...opened(ids),
      roundStart(0, ids),
      ...draws,
      ...taps('a', [100, 100, 100, 100, 100]),
      ended(0),
    ];
    expect(recap(log, 0, own([]))?.fastest).toBeUndefined();
    expect(recap(log)?.fastest).toBeUndefined();
  });

  it('breaks a tie on the average by more taps', () => {
    const log = [
      ...opened(ids),
      roundStart(0, ids),
      ...draws,
      ...taps('a', [500, 500, 500, 500, 500]),
      ...taps('b', [500, 500, 500, 500, 500, 500]),
      ended(0),
    ];
    expect(
      recap(
        log,
        0,
        own([
          ['a', 5],
          ['b', 6],
        ]),
      )?.fastest?.name,
    ).toBe('b');
  });
});
