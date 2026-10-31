/**
 * @file   apps/server/src/dev/fastRulesets.test.ts
 * @module server/dev
 * @brief  The fast test profile is short, valid, and leaves the published defaults untouched.
 *
 * Responsibility: building the fast royale changes no published default ruleset (deep
 *                 comparison with a copy taken before); the fast royale passes the ruleset
 *                 schema, plays one round per stage with 12 draws and a first-row final;
 *                 the classic types have no fast ruleset (their defaults apply).
 * Depends on:     @sbr/contracts, ./fastRulesets
 * Spec:           docs/spec/12-testing-strategy.md §4, §8
 */
import { DEFAULT_RULESETS, RulesetSchema, royaleRealtimeDefault } from '@sbr/contracts';
import { describe, expect, it } from 'vitest';

import { fastRuleset } from './fastRulesets.js';

describe('fast test profile', () => {
  it('leaves every published default ruleset as it was', () => {
    const before = structuredClone(DEFAULT_RULESETS);
    fastRuleset('royale');
    fastRuleset('classic');
    expect(DEFAULT_RULESETS).toEqual(before);
    expect(royaleRealtimeDefault.stages?.[0]?.roundEnd).toEqual({ kind: 'drawCount', draws: 40 });
  });

  it('plays a short royale and keeps the classic defaults', () => {
    const fast = fastRuleset('royale');
    expect(fast?.name).toBe('royale-realtime-fast-test');
    expect(RulesetSchema.safeParse(fast?.ruleset).success).toBe(true);
    expect(fast?.ruleset.stages?.map((s) => [s.rounds, s.roundEnd])).toEqual([
      [1, { kind: 'drawCount', draws: 12 }],
      [1, { kind: 'drawCount', draws: 12 }],
      [1, { kind: 'firstBingo', graceDraws: 0 }],
    ]);
    expect(fast?.ruleset.stages).not.toBe(royaleRealtimeDefault.stages);
    expect(fastRuleset('classic')).toBeNull();
    expect(fastRuleset('classicSeasons')).toBeNull();
  });
});
