/**
 * @file   packages/domain/src/match/lifecycle.test.ts
 * @module domain/match
 * @brief  Direct tests for the royale lifecycle rules RUN-3 found untested (RUN-4 step 3).
 *
 * Responsibility: round-end conditions (01 §7.3), score carry keep/reset/scaled and the
 *                 stage multiplier (01 §7.2), skipped elimination stages (01 §7.4) and
 *                 the jackpot claim guard (01 §8.5: Season Complete and full house in the
 *                 same round).
 * Depends on:     ./roundEnd, ./markResolver, ../index, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §7.2–§7.4, §8.5
 */
import { describe, expect, it } from 'vitest';

import {
  createInitialMatchState,
  evolve,
  generateCard,
  simulateMatch,
  type DomainEvent,
  type MatchRuleset,
  type MatchState,
  type StagePlanEntry,
} from '../index.js';
import { royaleRuleset, seed } from '../../test/builders.js';
import { buildMarkEvents } from './markResolver.js';
import type { RoundState } from './matchState.js';
import { royaleEndReason } from './roundEnd.js';

const FINAL: StagePlanEntry = {
  kind: 'final',
  rounds: 1,
  roundEnd: { kind: 'firstFullHouse' },
  scoreCarry: { kind: 'reset' },
  stageMultiplier: 1,
  activePatterns: ['fullCard'],
};

function round(over: Partial<RoundState>): RoundState {
  return {
    roundIndex: 0,
    stageIndex: 0,
    roundInStage: 0,
    stage: FINAL,
    drawSequence: Array.from({ length: 75 }, (_v, i) => i + 1),
    draws: [],
    cards: {},
    firstToPrize: {},
    fullHouseBy: [],
    classicAwards: [],
    outstandingPrizes: [],
    ended: false,
    ...over,
  };
}

const draws = (n: number): number[] => Array.from({ length: n }, (_v, i) => i + 1);

describe('round-end conditions (01 §7.3)', () => {
  it('drawCount ends after exactly N draws', () => {
    const cond = { kind: 'drawCount', draws: 40 } as const;
    expect(royaleEndReason(round({ draws: draws(39) }), 10, cond)).toBeNull();
    expect(royaleEndReason(round({ draws: draws(40) }), 10, cond)).toBe('drawCount');
  });

  it('firstBingo waits graceDraws after the first completed pattern', () => {
    const cond = { kind: 'firstBingo', graceDraws: 2 } as const;
    const firstToPrize = { 'rows-1': { accountId: 'a', drawIndex: 3 } };
    expect(royaleEndReason(round({ draws: draws(4) }), 10, cond)).toBeNull();
    expect(royaleEndReason(round({ draws: draws(5), firstToPrize }), 10, cond)).toBeNull();
    expect(royaleEndReason(round({ draws: draws(6), firstToPrize }), 10, cond)).toBe('firstBingo');
  });

  it('bingoQuota ends once enough distinct players completed a pattern', () => {
    const cond = { kind: 'bingoQuota', quotaPercent: 30 } as const;
    const two = { a: { accountId: 'p1', drawIndex: 1 }, b: { accountId: 'p2', drawIndex: 2 } };
    const three = { ...two, c: { accountId: 'p3', drawIndex: 3 } };
    expect(royaleEndReason(round({ draws: draws(5), firstToPrize: two }), 10, cond)).toBeNull();
    expect(royaleEndReason(round({ draws: draws(5), firstToPrize: three }), 10, cond)).toBe(
      'bingoQuota',
    );
  });

  it('firstFullHouse ends on the first full house; poolExhausted always ends the round', () => {
    const cond = { kind: 'firstFullHouse' } as const;
    expect(royaleEndReason(round({ draws: draws(50) }), 10, cond)).toBeNull();
    expect(royaleEndReason(round({ draws: draws(50), fullHouseBy: ['a'] }), 10, cond)).toBe(
      'firstFullHouse',
    );
    const drawCount = { kind: 'drawCount', draws: 99 } as const;
    expect(royaleEndReason(round({ draws: draws(75) }), 10, drawCount)).toBe('poolExhausted');
  });
});

// A two-stage royale (qualification with cut → final) whose final uses `carry`.
function twoStage(carry: StagePlanEntry['scoreCarry'], multiplier = 1): MatchRuleset {
  const [qualification] = royaleRuleset().stages;
  if (qualification === undefined) throw new Error('missing qualification stage');
  return {
    ...royaleRuleset(),
    stages: [qualification, { ...FINAL, scoreCarry: carry, stageMultiplier: multiplier }],
  };
}

function run(ruleset: MatchRuleset, players = 8) {
  return simulateMatch({
    matchId: 'carry',
    seed: seed(7),
    gameType: 'royale',
    ruleset,
    playerCount: players,
    tickedPrizes: [],
  });
}

// Live state right before and right after the final stage starts.
function aroundFinalStart(events: readonly DomainEvent[]): {
  before: MatchState;
  after: MatchState;
} {
  let state = createInitialMatchState();
  for (const ev of events) {
    if (ev.type === 'stageStarted' && ev.stageIndex === 1) {
      return { before: state, after: evolve(state, ev) };
    }
    state = evolve(state, ev);
  }
  throw new Error('no final stage');
}

describe('score carry (01 §7.2)', () => {
  it.each([
    ['keep', { kind: 'keep' } as const, 1],
    ['reset', { kind: 'reset' } as const, 0],
    ['scaled 0.5', { kind: 'scaled', factor: 0.5 } as const, 0.5],
  ])(
    '%s: active players carry points × factor, eliminated players keep theirs',
    (_n, carry, factor) => {
      const { before, after } = aroundFinalStart(run(twoStage(carry)).events);
      for (const id of before.playerOrder) {
        const was = before.players[id];
        const now = after.players[id];
        const expected =
          was?.eliminatedAtRound === null ? Math.round(was.points * factor) : was?.points;
        expect(now?.points).toBe(expected);
      }
    },
  );
});

describe('stage multiplier (01 §7.2)', () => {
  it('multiplies every point earned in the stage, and only in that stage', () => {
    const finalEvents = (multiplier: number): DomainEvent[] => {
      const events = run(twoStage({ kind: 'keep' }, multiplier)).events;
      const start = events.findIndex((e) => e.type === 'stageStarted' && e.stageIndex === 1);
      return events.slice(start);
    };
    const points = (ev: DomainEvent): number =>
      ev.type === 'cellMarked' ? ev.markPoints : ev.type === 'patternScored' ? ev.points : 0;
    const one = finalEvents(1);
    const three = finalEvents(3);
    expect(three.map((e) => e.type)).toEqual(one.map((e) => e.type));
    expect(one.some((e) => points(e) > 0)).toBe(true);
    three.forEach((ev, i) => {
      expect(points(ev)).toBe(points(one[i] ?? ev) * 3);
    });
  });
});

describe('skipped elimination stages (01 §7.4)', () => {
  it('skips an elimination stage whose field is already at the final size', () => {
    const events = simulateMatch({
      matchId: 'skip',
      seed: seed(3),
      gameType: 'royale',
      ruleset: royaleRuleset(),
      playerCount: 3,
      tickedPrizes: [],
    }).events;
    const roundsIn = (stage: number): number =>
      events.filter((e) => e.type === 'roundStarted' && e.stageIndex === stage).length;
    expect(roundsIn(0)).toBe(2);
    expect(roundsIn(1)).toBe(0);
    expect(roundsIn(2)).toBe(1);
  });
});

// A one-player royale final whose card is full except the last open cell; Season
// Complete fired in `scRound`, the full house would land in `markRound`.
function nearlyFullHouse(
  scRound: number,
  markRound: number,
): { state: MatchState; lastCell: number } {
  const ruleset: MatchRuleset = { ...royaleRuleset(), stages: [FINAL] };
  const card = generateCard({
    seed: seed(1),
    matchId: 'jp',
    roundIndex: 0,
    accountId: 'p0',
    cardIndex: 0,
    gameType: 'royale',
    freeCenter: true,
  });
  const lastCell = 24;
  const startRound = (roundIndex: number): DomainEvent => ({
    type: 'roundStarted',
    roundIndex,
    stageIndex: 0,
    roundInStage: roundIndex,
    drawSequence: draws(75),
    cardsByPlayer: { p0: [card] },
  });
  const events: DomainEvent[] = [
    {
      type: 'lobbyOpened',
      matchId: 'jp',
      gameType: 'royale',
      ruleset,
      seed: seed(1),
      stagePlan: [FINAL],
      tickedPrizes: [],
    },
    { type: 'playerJoined', accountId: 'p0', joinedAt: 0 },
    { type: 'matchStarted' },
    { type: 'stageStarted', stageIndex: 0 },
    startRound(0),
  ];
  const fireSc = (): void => {
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const)
      events.push({ type: 'seasonActivated', accountId: 'p0', season, instantPoints: 0 });
    events.push({ type: 'seasonCompleteFired', accountId: 'p0', points: 300 });
  };
  if (scRound === 0) fireSc();
  if (markRound === 1)
    events.push({ type: 'roundEnded', roundIndex: 0, reason: 'drawCount' }, startRound(1));
  for (let cell = 0; cell < lastCell; cell += 1) {
    if (card.cells[cell]?.kind === 'number')
      events.push({
        type: 'cellMarked',
        accountId: 'p0',
        cardIndex: 0,
        cellIndex: cell,
        markPoints: 10,
      });
  }
  const state = events.reduce(evolve, createInitialMatchState());
  return { state, lastCell };
}

describe('jackpot claim guard (01 §8.5)', () => {
  const mark = (state: MatchState, cellIndex: number) =>
    buildMarkEvents(state, {
      accountId: 'p0',
      cardIndex: 0,
      cellIndex,
      inSpeedWindow: false,
      speedBonus: 0,
    });

  it('claims when Season Complete and the full house land in the same round', () => {
    const { state, lastCell } = nearlyFullHouse(0, 0);
    expect(mark(state, lastCell).some((e) => e.type === 'jackpotClaimed')).toBe(true);
  });

  it('does not claim when the full house lands in a later round', () => {
    const { state, lastCell } = nearlyFullHouse(0, 1);
    const events = mark(state, lastCell);
    expect(events.some((e) => e.type === 'patternScored' && e.prizeKey === 'fullCard')).toBe(true);
    expect(events.some((e) => e.type === 'jackpotClaimed')).toBe(false);
  });
});
