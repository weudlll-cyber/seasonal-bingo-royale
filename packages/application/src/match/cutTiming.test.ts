/**
 * @file   packages/application/src/match/cutTiming.test.ts
 * @module application/match
 * @brief  The royale defaults cut the qualification stage once, after the stage (01 §7.1).
 *
 * Responsibility: a simulated 100-player royale on each default ruleset (realtime and
 *                 asynchronous) has no cut after the first qualification round, one after
 *                 the second, one after each elimination round, and reaches the final with
 *                 13: 100 → 50 → 25 → 13 without the Winter shield; with it each cut keeps
 *                 half its field, rounded up, plus the players it saved. A stage left
 *                 without the timing (a ruleset frozen before it existed) still cuts after
 *                 every round, as its matches were played.
 * Depends on:     @sbr/contracts, @sbr/domain, vitest, ./rulesets
 * Spec:           docs/spec/01-game-design.md §7.1, §7.4
 */
import { royaleAsyncDefault, royaleRealtimeDefault, type Ruleset } from '@sbr/contracts';
import { simulateMatch, type DomainEvent } from '@sbr/domain';
import { describe, expect, it } from 'vitest';

import { toMatchRuleset } from './rulesets.js';

type Cut = Extract<DomainEvent, { type: 'cutApplied' }>;

// The cuts of a simulated royale, each with the round it followed.
function cutsOf(ruleset: Ruleset, playerCount: number): { round: number; cut: Cut }[] {
  const { events } = simulateMatch({
    matchId: 'cut-timing',
    seed: new Uint8Array(32).fill(7),
    gameType: 'royale',
    ruleset: toMatchRuleset(ruleset, 'auto', { kind: 'noAutoMark' }),
    playerCount,
    tickedPrizes: [],
  });
  let round = -1;
  const cuts: { round: number; cut: Cut }[] = [];
  for (const ev of events) {
    if (ev.type === 'roundStarted') round = ev.roundIndex;
    if (ev.type === 'cutApplied') cuts.push({ round, cut: ev });
  }
  return cuts;
}

// The ruleset with the Winter shield switched off, so no save adds to a cut.
function withoutShield(ruleset: Ruleset): Ruleset {
  const winter = { ...ruleset.seasons.winter, effect: { type: 'none' as const } };
  return { ...ruleset, seasons: { ...ruleset.seasons, winter } };
}

describe.each([
  ['realtime', royaleRealtimeDefault],
  ['asynchronous', royaleAsyncDefault],
])('the %s royale default with 100 starters', (_mode, ruleset) => {
  it('cuts after qualification, then after each elimination round: 50 → 25 → 13', () => {
    const cuts = cutsOf(withoutShield(ruleset), 100);
    expect(cuts.map((c) => c.round)).toEqual([1, 2, 3]);
    expect(cuts.map((c) => c.cut.survivors.length)).toEqual([50, 25, 13]);
  });

  it('with the Winter shield, keeps half of each field (rounded up) plus the saves', () => {
    const cuts = cutsOf(ruleset, 100);
    expect(cuts.map((c) => c.round)).toEqual([1, 2, 3]);
    let field = 100;
    for (const { cut } of cuts) {
      expect(cut.survivors.length).toBe(Math.ceil(field / 2) + cut.shieldSaves.length);
      field = cut.survivors.length;
    }
  });
});

describe('a stage frozen without a cut timing', () => {
  it('cuts after every round, as before', () => {
    const stages = royaleRealtimeDefault.stages?.map((s) => {
      const { cutTiming: _dropped, ...rest } = s;
      return rest;
    });
    const cuts = cutsOf({ ...royaleRealtimeDefault, stages }, 100);
    expect(cuts.map((c) => c.round)).toEqual([0, 1, 2, 3]);
  });
});
