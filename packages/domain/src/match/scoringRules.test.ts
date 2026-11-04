/**
 * @file   packages/domain/src/match/scoringRules.test.ts
 * @module domain/match
 * @brief  What the Summer boost multiplies (D44) and who is first to a pattern on one draw (D45).
 *
 * Responsibility: with a ×2 boost a tap inside the speed window scores (mark + speed bonus) × 2,
 *                 while the pattern it completes, an Autumn harvest and a Season Complete keep
 *                 their points (D44). A pattern completed on the draw that first completed it
 *                 in the round takes the first-player bonus unless an earlier-received tap
 *                 completed it on that draw; an automatic mark, a missed-number auto-mark or
 *                 the same receive time cannot be told apart and takes it too; a later draw
 *                 never does (D45).
 * Depends on:     vitest, ../seasons/effectState, ./matchState, ./markResolver, ../../test/builders
 * Spec:           docs/spec/01-game-design.md §8.1, §8.2 (D44, D45)
 */
import { describe, expect, it } from 'vitest';

import { INITIAL_EFFECT_STATE, type EffectState } from '../seasons/effectState.js';
import type { MatchState } from './matchState.js';
import { buildMarkEvents, type MarkInput } from './markResolver.js';
import { royaleRuleset } from '../../test/builders.js';

type First = { accountId: string; drawIndex: number; tapAt: number | null };

// Row 0 (cells 0–4) has four cells marked; marking cell 4 completes "1 row" on draw 2.
// Season cells: Spring 20, Summer 21, Autumn 9 (row 1, cells 5–8 marked), Winter 23.
function stateWith(opts: {
  readonly effects?: EffectState;
  readonly first?: First;
  readonly seasonsActivated?: number;
}): MatchState {
  const cells = Array.from({ length: 25 }, (_v, i) =>
    i === 12 ? { kind: 'free' } : { kind: 'number', value: i + 1 },
  );
  const marks = Array.from({ length: 25 }, (_v, i) => i === 12 || (i < 9 && i !== 4));
  const effects = {
    ...(opts.effects ?? INITIAL_EFFECT_STATE),
    seasonsActivated: opts.seasonsActivated ?? 0,
  };
  return {
    gameType: 'royale',
    ruleset: royaleRuleset(),
    players: { p: { effects, points: 0, seasonCompleteFired: false } },
    jackpot: { claimedBy: null },
    currentRound: {
      draws: [1, 2, 5],
      stage: { stageMultiplier: 1, activePatterns: ['rows-1'] },
      classicAwards: [],
      fullHouseBy: [],
      windowClosedThrough: -1,
      firstToPrize: opts.first === undefined ? {} : { 'rows-1': opts.first },
      cards: {
        p: [{ card: { cells, seasonCells: [20, 21, 9, 23] }, marks, scoredPrizes: [] }],
      },
    },
  } as unknown as MatchState;
}

const BOOST: EffectState = {
  ...INITIAL_EFFECT_STATE,
  multiplier: { factor: 2, remainingDraws: 5 },
};

function mark(state: MatchState, cellIndex: number, patch: Partial<MarkInput> = {}) {
  return buildMarkEvents(state, {
    accountId: 'p',
    cardIndex: 0,
    cellIndex,
    inSpeedWindow: true,
    speedBonus: 6,
    ...patch,
  });
}

function pointsOf(events: ReturnType<typeof mark>, type: string): number | undefined {
  const e = events.find((x) => x.type === type);
  if (e === undefined) return undefined;
  if (e.type === 'cellMarked') return e.markPoints;
  if (e.type === 'seasonActivated') return e.instantPoints;
  if (e.type === 'patternScored' || e.type === 'seasonCompleteFired') return e.points;
  return undefined;
}

describe('the Summer boost (D44)', () => {
  it('multiplies the mark and its speed bonus: (10 + 6) × 2', () => {
    expect(pointsOf(mark(stateWith({ effects: BOOST }), 4), 'cellMarked')).toBe(32);
  });

  it('leaves the completed pattern at its points with the first bonus: 100 + 50 %', () => {
    expect(pointsOf(mark(stateWith({ effects: BOOST }), 4), 'patternScored')).toBe(150);
  });

  it('leaves the Autumn harvest and Season Complete unmultiplied', () => {
    // Spring, Summer and Winter active; the Autumn cell (9) has 4 marked cells in its row.
    const events = mark(stateWith({ effects: BOOST, seasonsActivated: 1 | 2 | 8 }), 9);
    expect(pointsOf(events, 'seasonActivated')).toBe(4 * 15);
    expect(pointsOf(events, 'seasonCompleteFired')).toBe(300);
  });
});

describe('the first player to a pattern on one draw (D45)', () => {
  const firstOf = (first: First | undefined, patch: Partial<MarkInput>): boolean | undefined => {
    const e = mark(stateWith(first === undefined ? {} : { first }), 4, patch).find(
      (x) => x.type === 'patternScored',
    );
    return e?.type === 'patternScored' ? e.firstInRound : undefined;
  };
  const tapped = (tapAt: number): First => ({ accountId: 'q', drawIndex: 2, tapAt });

  it('goes to the only one', () => {
    expect(firstOf(undefined, { receivedAt: 1_500 })).toBe(true);
  });

  it('goes to the tap that arrived first, not a later one', () => {
    expect(firstOf(tapped(1_000), { receivedAt: 1_500 })).toBe(false);
  });

  it('goes to both taps with the same receive time', () => {
    expect(firstOf(tapped(1_000), { receivedAt: 1_000 })).toBe(true);
  });

  it('goes to a tap after an automatic mark, and to an auto-mark after a tap', () => {
    expect(firstOf({ accountId: 'q', drawIndex: 2, tapAt: null }, { receivedAt: 1_500 })).toBe(
      true,
    );
    expect(firstOf(tapped(1_000), { inSpeedWindow: false, speedBonus: 0 })).toBe(true);
  });

  it('never goes to a completion on a later draw', () => {
    expect(firstOf({ accountId: 'q', drawIndex: 1, tapAt: null }, {})).toBe(false);
  });

  it('carries the receive time of the completing tap, none for an automatic mark', () => {
    const scored = (patch: Partial<MarkInput>) =>
      mark(stateWith({}), 4, patch).find((x) => x.type === 'patternScored');
    expect(scored({ receivedAt: 1_500 })).toMatchObject({ tapAt: 1_500 });
    expect(scored({})).not.toHaveProperty('tapAt');
  });
});
