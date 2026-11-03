/**
 * @file   packages/application/src/leaderboard/leaguePoints.test.ts
 * @module application/leaderboard
 * @brief  League points per place and which finished matches award them (01 §10, 03 §11).
 *
 * Responsibility: the placement table with the finalist and finish bonus; a match counts
 *                 only with the leaderboard flag on, without bots and with at least the
 *                 minimum of distinct verified human players (7 → nothing, 8 → awarded);
 *                 unverified players neither count nor score while verification is required;
 *                 wins and Season Completes travel with each award.
 * Depends on:     @sbr/contracts, ./leaguePoints
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/03-security-architecture.md §11
 */
import { LEADERBOARD_DEFAULTS } from '@sbr/contracts';
import { describe, expect, it } from 'vitest';

import {
  countsForLeague,
  leagueAwards,
  placementPoints,
  type LeagueEntryInput,
} from './leaguePoints.js';

const C = LEADERBOARD_DEFAULTS;

// `n` verified humans placed 1..n; the first is a finalist with Season Complete.
function humans(n: number): LeagueEntryInput[] {
  return Array.from({ length: n }, (_, i) => ({
    accountId: `acc-${String(i + 1)}`,
    isBot: false,
    verified: true,
    place: i + 1,
    finalist: i === 0,
    seasonComplete: i === 0,
  }));
}

describe('placement points (01 §10)', () => {
  it('follows the default table, plus the finish bonus for everyone placed', () => {
    const points = [1, 2, 3, 4, 10, 11, 25, 26].map((p) => placementPoints(p, false, C));
    expect(points).toEqual([102, 72, 52, 27, 27, 12, 12, 2]);
  });

  it('adds the finalist bonus', () => {
    expect(placementPoints(1, true, C)).toBe(112);
    expect(placementPoints(30, true, C)).toBe(12);
  });
});

describe('which matches award league points (03 §11)', () => {
  const match = (entries: LeagueEntryInput[], flag = true) => ({
    countsForLeaderboard: flag,
    entries,
  });

  it('needs at least 8 distinct verified humans: 7 give nothing, 8 count', () => {
    expect(countsForLeague(match(humans(7)), C)).toBe(false);
    expect(leagueAwards(match(humans(7)), C)).toEqual([]);
    expect(countsForLeague(match(humans(8)), C)).toBe(true);
    expect(leagueAwards(match(humans(8)), C)).toHaveLength(8);
  });

  it('gives nothing when the leaderboard flag is off', () => {
    expect(countsForLeague(match(humans(10), false), C)).toBe(false);
  });

  it('gives nothing when a bot played', () => {
    const bot = { ...humans(1)[0], accountId: null, isBot: true, verified: false };
    expect(countsForLeague(match([...humans(10), bot as LeagueEntryInput]), C)).toBe(false);
  });

  it('counts unverified players only when verification is not required', () => {
    const entries = humans(8).map((e, i) => (i === 7 ? { ...e, verified: false } : e));
    expect(countsForLeague(match(entries), C)).toBe(false);
    const relaxed = { ...C, requireVerifiedPlayers: false };
    expect(countsForLeague(match(entries), relaxed)).toBe(true);
  });

  it('awards only verified, placed players, with wins and Season Completes', () => {
    const entries = [
      ...humans(8),
      { ...humans(9)[8], verified: false } as LeagueEntryInput,
      { ...humans(10)[9], place: null } as LeagueEntryInput,
      {
        accountId: null,
        isBot: false,
        verified: false,
        place: 11,
        finalist: false,
        seasonComplete: false,
      },
    ];
    const awards = leagueAwards(match(entries), C);
    expect(awards.map((a) => a.accountId)).toEqual(humans(8).map((e) => e.accountId));
    expect(awards[0]).toEqual({
      accountId: 'acc-1',
      points: 112,
      place: 1,
      win: true,
      seasonComplete: true,
    });
    expect(awards[1]).toMatchObject({ points: 72, win: false, seasonComplete: false });
  });

  it('counts an account once, however many entries it has', () => {
    const twice = [...humans(7), { ...humans(1)[0] } as LeagueEntryInput];
    expect(countsForLeague(match(twice), C)).toBe(false);
  });
});
