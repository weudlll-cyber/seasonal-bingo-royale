/**
 * @file   packages/domain/src/royale/royale.test.ts
 * @module domain/royale
 * @brief  Royale structure tests: cut, final ranking, jackpot (12 §3 inv. 7, 8, 10).
 *
 * Responsibility: cover the invariants directly. The cut tests check minSurvivors,
 *                 the shield rescue margin, and the "no survivor is beaten by an
 *                 eliminated player" rule. finalRanking returns a total order 1..N
 *                 without gaps. jackpotValue is `base + growth × unclaimed`.
 * Depends on:     ../index
 * Spec:           docs/spec/12-testing-strategy.md §3 inv. 7, 8, 10
 */
import { describe, expect, it } from 'vitest';

import {
  applyCut,
  finalRanking,
  jackpotValue,
  type Candidate,
  type RankedPlayer,
} from '../index.js';

function makeCandidate(partial: Partial<Candidate> & { accountId: string }): Candidate {
  return {
    points: 0,
    patterns: 0,
    seasonsActivated: 0,
    lastScoringDraw: null,
    joinedAt: 0,
    shieldCharges: 0,
    shieldRankMargin: 0,
    ...partial,
  };
}

describe('applyCut', () => {
  it('keeps the top `percent` of players and eliminates the rest', () => {
    const candidates = [
      makeCandidate({ accountId: 'a', points: 100 }),
      makeCandidate({ accountId: 'b', points: 80 }),
      makeCandidate({ accountId: 'c', points: 60 }),
      makeCandidate({ accountId: 'd', points: 40 }),
    ];
    const result = applyCut(candidates, { keep: 'percent', value: 50, minSurvivors: 2 });
    expect(result.survivors).toEqual(['a', 'b']);
    expect(result.eliminated).toEqual(['c', 'd']);
  });

  // D18: a percentage cut rounds the number of survivors up.
  it.each([
    { players: 10, percent: 33, min: 2, survivors: 4 },
    { players: 25, percent: 50, min: 2, survivors: 13 },
    { players: 7, percent: 50, min: 2, survivors: 4 },
    { players: 100, percent: 50, min: 2, survivors: 50 },
    { players: 10, percent: 70, min: 2, survivors: 7 },
    { players: 5, percent: 10, min: 3, survivors: 3 },
  ])('keeps $survivors of $players at $percent % (min $min, D18)', (c) => {
    const candidates = Array.from({ length: c.players }, (_v, i) =>
      makeCandidate({ accountId: `p${String(i)}`, points: 1_000 - i }),
    );
    const result = applyCut(candidates, { keep: 'percent', value: c.percent, minSurvivors: c.min });
    expect(result.survivors).toHaveLength(c.survivors);
  });

  it('never drops below minSurvivors', () => {
    const candidates = Array.from({ length: 4 }, (_v, i) =>
      makeCandidate({ accountId: `p${String(i)}`, points: 100 - i * 10 }),
    );
    const result = applyCut(candidates, { keep: 'count', value: 1, minSurvivors: 3 });
    expect(result.survivors).toHaveLength(3);
  });

  it('shield rescues a player within rankMargin places of the cut line', () => {
    // Keep top 2 of 5. Player at place 4 has a shield with rank margin 2 → rescued.
    const candidates = [
      makeCandidate({ accountId: 'a', points: 100 }),
      makeCandidate({ accountId: 'b', points: 90 }),
      makeCandidate({ accountId: 'c', points: 80 }),
      makeCandidate({ accountId: 'd', points: 70, shieldCharges: 1, shieldRankMargin: 2 }),
      makeCandidate({ accountId: 'e', points: 60 }),
    ];
    const result = applyCut(candidates, { keep: 'count', value: 2, minSurvivors: 2 });
    expect(result.survivors).toContain('d');
    expect(result.shieldSaves).toEqual(['d']);
    expect(result.eliminated).toContain('e');
    expect(result.eliminated).toContain('c');
  });

  it('shield does not rescue a player too far below the cut line', () => {
    const candidates = [
      makeCandidate({ accountId: 'a', points: 100 }),
      makeCandidate({ accountId: 'b', points: 90 }),
      makeCandidate({ accountId: 'c', points: 80 }),
      makeCandidate({ accountId: 'd', points: 70 }),
      makeCandidate({ accountId: 'e', points: 60, shieldCharges: 1, shieldRankMargin: 1 }),
    ];
    const result = applyCut(candidates, { keep: 'count', value: 2, minSurvivors: 2 });
    expect(result.survivors).toEqual(['a', 'b']);
    expect(result.eliminated).toContain('e');
    expect(result.shieldSaves).toEqual([]);
  });
});

const PL_A: RankedPlayer = {
  accountId: 'a',
  joinedAt: 0,
  points: 100,
  patterns: 1,
  seasonsActivated: 1,
  lastScoringDraw: 5,
  eliminatedAtRound: null,
};
const PL_B: RankedPlayer = { ...PL_A, accountId: 'b', joinedAt: 1, lastScoringDraw: 4 };
const PL_C: RankedPlayer = {
  accountId: 'c',
  joinedAt: 0,
  points: 50,
  patterns: 0,
  seasonsActivated: 0,
  lastScoringDraw: 1,
  eliminatedAtRound: 2,
};

describe('finalRanking', () => {
  it('produces a total order 1..N without gaps', () => {
    const placements = finalRanking([PL_A, PL_B, PL_C]);
    expect(placements.map((p) => p.place)).toEqual([1, 2, 3]);
    expect(placements[0]?.accountId).toBe('b');
    expect(placements[2]?.accountId).toBe('c');
  });

  it('ranks later-eliminated players above earlier ones', () => {
    const late: RankedPlayer = { ...PL_C, accountId: 'late', eliminatedAtRound: 3, points: 10 };
    const early: RankedPlayer = { ...PL_C, accountId: 'early', eliminatedAtRound: 1, points: 999 };
    const placements = finalRanking([late, early]);
    expect(placements[0]?.accountId).toBe('late');
  });
});

describe('jackpotValue', () => {
  it('is base + growth × unclaimedRounds', () => {
    expect(jackpotValue({ base: 1_000, growthPerRound: 250 }, 0)).toBe(1_000);
    expect(jackpotValue({ base: 1_000, growthPerRound: 250 }, 4)).toBe(2_000);
  });

  it('rejects a negative unclaimedRounds', () => {
    expect(() => jackpotValue({ base: 1_000, growthPerRound: 250 }, -1)).toThrow();
  });
});
