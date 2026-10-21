/**
 * @file   packages/domain/src/match/missedNumbers.test.ts
 * @module domain/match
 * @brief  Per-player marking and the missed-number rule D9 (01 §6, 12 §3 inv. 17, 18).
 *
 * Responsibility: drive decide/evolve with one tapping person and one bot in a manual
 *                 royale match and check: bots are marked on the draw, a tap inside the
 *                 speed window earns the bonus and a later tap does not, autoMarkAfter
 *                 marks an open cell exactly at the delay, noAutoMark leaves it open and
 *                 it counts for nothing until tapped, and the round end closes all taps.
 * Depends on:     ../index, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §6; docs/spec/12-testing-strategy.md §3
 */
import { describe, expect, it } from 'vitest';

import {
  createInitialMatchState,
  simulateMatch,
  type Command,
  type MarkCell,
  type DomainEvent,
  type MatchState,
  type MissedNumbers,
} from '../index.js';
import { royaleRuleset, seed } from '../../test/builders.js';
import { drawAndClose, play } from '../../test/drive.js';

const AFTER_3S: MissedNumbers = { kind: 'autoMarkAfter', delayMs: 3_000 };
const LEAVE_OPEN: MissedNumbers = { kind: 'noAutoMark' };
const POINTS_PER_MARK = royaleRuleset().pointsPerMark;

// A manual royale match with the person `h` and the bot `b`, first round started.
function setup(missedNumbers: MissedNumbers): MatchState {
  const ruleset = { ...royaleRuleset(), markingMode: 'manual' as const, missedNumbers };
  const commands: Command[] = [
    {
      type: 'openLobby',
      matchId: 'm-d9',
      gameType: 'royale',
      ruleset,
      seed: seed(9),
      tickedPrizes: [],
    },
    { type: 'joinMatch', accountId: 'h', joinedAt: 0, human: true },
    { type: 'joinMatch', accountId: 'b', joinedAt: 1 },
    { type: 'startMatch' },
    { type: 'startRound' },
  ];
  return commands.reduce((s, c) => play(s, c).state, createInitialMatchState());
}

interface Hit {
  readonly state: MatchState;
  readonly events: DomainEvent[];
  readonly cellIndex: number;
  readonly drawIndex: number;
}

// Draws until an item lands on a cell of h's card that `wanted` accepts.
function drawUntilHit(start: MatchState, wanted: (cellIndex: number) => boolean): Hit {
  let state = start;
  for (;;) {
    const r = play(state, { type: 'drawNext' });
    state = r.state;
    const round = state.currentRound;
    if (round === null || r.events.length === 0) throw new Error('no hit in this round');
    const item = round.draws[round.draws.length - 1];
    const cells = round.cards['h']?.[0]?.card.cells ?? [];
    const cellIndex = cells.findIndex((c) => c.kind !== 'free' && c.value === item);
    if (cellIndex >= 0 && wanted(cellIndex)) {
      return { state, events: r.events, cellIndex, drawIndex: round.draws.length - 1 };
    }
  }
}

const tap = (cellIndex: number, inSpeedWindow: boolean): MarkCell => ({
  type: 'markCell',
  accountId: 'h',
  cardIndex: 0,
  cellIndex,
  inSpeedWindow,
  speedBonus: 7,
});

const marked = (s: MatchState, id: string, cell: number): boolean =>
  s.currentRound?.cards[id]?.[0]?.marks[cell] === true;

const markPoints = (events: DomainEvent[]): number[] =>
  events.flatMap((e) => (e.type === 'cellMarked' && e.accountId === 'h' ? [e.markPoints] : []));

describe('per-player marking mode (01 §6, inv. 18)', () => {
  it('marks the bot on the draw and leaves the tapping person open', () => {
    const hit = drawUntilHit(setup(AFTER_3S), () => true);
    expect(markPoints(hit.events)).toEqual([]);
    expect(marked(hit.state, 'h', hit.cellIndex)).toBe(false);
    const round = hit.state.currentRound;
    const botCard = round?.cards['b']?.[0];
    botCard?.card.cells.forEach((c, i) => {
      if (c.kind !== 'free' && round?.draws.includes(c.value)) expect(botCard.marks[i]).toBe(true);
    });
  });

  it('ignores a tap for a bot', () => {
    const hit = drawUntilHit(setup(AFTER_3S), () => true);
    expect(play(hit.state, { ...tap(hit.cellIndex, true), accountId: 'b' }).events).toEqual([]);
  });
});

describe('mark resolution for a tapping person (01 §6, inv. 17)', () => {
  it('a tap inside the speed window earns the bonus', () => {
    const hit = drawUntilHit(setup(LEAVE_OPEN), () => true);
    expect(markPoints(play(hit.state, tap(hit.cellIndex, true)).events)[0]).toBe(
      POINTS_PER_MARK + 7,
    );
  });

  it('a later tap marks without bonus in both variants', () => {
    for (const missed of [AFTER_3S, LEAVE_OPEN]) {
      const hit = drawUntilHit(setup(missed), () => true);
      const r = play(hit.state, tap(hit.cellIndex, false));
      expect(markPoints(r.events)[0]).toBe(POINTS_PER_MARK);
      expect(marked(r.state, 'h', hit.cellIndex)).toBe(true);
    }
  });

  it('autoMarkAfter marks the open cell without bonus; noAutoMark leaves it open', () => {
    const after = drawUntilHit(setup(AFTER_3S), () => true);
    const r = play(after.state, { type: 'autoMarkMissed', drawIndex: after.drawIndex });
    expect(markPoints(r.events)).toEqual([POINTS_PER_MARK]);
    const open = drawUntilHit(setup(LEAVE_OPEN), () => true);
    expect(play(open.state, { type: 'autoMarkMissed', drawIndex: open.drawIndex }).events).toEqual(
      [],
    );
  });

  it('an open season cell activates nothing until it is tapped', () => {
    const start = setup(LEAVE_OPEN);
    const seasonCells = start.currentRound?.cards['h']?.[0]?.card.seasonCells ?? [];
    const hit = drawUntilHit(start, (i) => seasonCells.includes(i));
    expect(hit.state.players['h']?.effects.seasonsActivated).toBe(0);
    const tapped = play(hit.state, tap(hit.cellIndex, false));
    expect(tapped.state.players['h']?.effects.seasonsActivated).toBe(1);
  });

  it('the round end closes every open tap', () => {
    const hit = drawUntilHit(setup(LEAVE_OPEN), () => true);
    let state = hit.state;
    while (state.currentRound?.ended === false) state = drawAndClose(state);
    expect(play(state, tap(hit.cellIndex, false)).events).toEqual([]);
    expect(play(state, { type: 'autoMarkMissed', drawIndex: hit.drawIndex }).events).toEqual([]);
  });
});

describe('simulated people never tap (01 §6)', () => {
  const run = (missedNumbers: MissedNumbers, delayMs = 3_000) =>
    simulateMatch({
      matchId: 'm-sim-d9',
      seed: seed(4),
      gameType: 'royale',
      ruleset: {
        ...royaleRuleset(),
        markingMode: 'manual',
        missedNumbers:
          missedNumbers.kind === 'autoMarkAfter' ? { ...missedNumbers, delayMs } : missedNumbers,
      },
      playerCount: 6,
      tickedPrizes: [],
      humans: { count: 1, drawIntervalMs: 1_000, speedWindowMs: 500 },
    });

  // For every mark of the person p000, how many draws after the drawn item it arrived.
  function markLagInDraws(events: readonly DomainEvent[]): number[] {
    const lags: number[] = [];
    let drawsInRound = 0;
    const drawnAt = new Map<number, number>();
    let cards: readonly { cells: readonly { kind: string; value?: number }[] }[] = [];
    for (const e of events) {
      if (e.type === 'roundStarted') {
        drawsInRound = 0;
        drawnAt.clear();
        cards = e.cardsByPlayer['p000'] ?? [];
      } else if (e.type === 'drawMade') {
        drawnAt.set(e.item, drawsInRound);
        drawsInRound += 1;
      } else if (e.type === 'cellMarked' && e.accountId === 'p000') {
        const value = cards[e.cardIndex]?.cells[e.cellIndex]?.value ?? -1;
        lags.push(drawsInRound - (drawnAt.get(value) ?? Number.NaN));
      }
    }
    return lags;
  }

  it('autoMarkAfter marks exactly when the delay has passed, measured in draws', () => {
    const lags3 = markLagInDraws(run(AFTER_3S, 3_000).events);
    expect(lags3.length).toBeGreaterThan(0);
    expect(new Set(lags3)).toEqual(new Set([3]));
    expect(new Set(markLagInDraws(run(AFTER_3S, 5_000).events))).toEqual(new Set([5]));
  });

  it('noAutoMark: an untapped person scores no mark, pattern or season', () => {
    const p = run(LEAVE_OPEN).state.players['p000'];
    expect(markLagInDraws(run(LEAVE_OPEN).events)).toEqual([]);
    expect(p?.points).toBe(0);
    expect(p?.patternsCount).toBe(0);
    expect(p?.effects.seasonsActivated).toBe(0);
  });
});
