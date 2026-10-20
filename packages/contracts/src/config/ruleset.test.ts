/**
 * @file   packages/contracts/src/config/ruleset.test.ts
 * @module contracts/config
 * @brief  Schema tests for the ruleset document: shape, defaults, cross-field rules.
 *
 * Responsibility: lock in the acceptance criteria of WP-04 — the schema accepts valid
 *                 rulesets of every game type, rejects the shape mismatches of 01 §3a
 *                 (prizes-on-royale, stages-on-classic, …), and the four shipped defaults
 *                 round-trip (docs/spec/04-database-design.md §6).
 * Depends on:     ./ruleset, ./defaults, ../index
 * Spec:           docs/spec/15-implementation-plan.md WP-04, docs/spec/01-game-design.md §3a
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIZE_SELECTION,
  DEFAULT_RULESETS,
  RulesetSchema,
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleAsyncDefault,
  royaleRealtimeDefault,
  type Ruleset,
} from '../index.js';

const everyDefault: readonly Ruleset[] = [
  royaleRealtimeDefault,
  royaleAsyncDefault,
  classicSeasonsRealtimeDefault,
  classicRealtimeDefault,
];

describe('RulesetSchema — defaults', () => {
  it('ships four published defaults', () => {
    expect(DEFAULT_RULESETS.map((r) => r.name)).toEqual([
      'royale-realtime',
      'royale-async',
      'classic-seasons-realtime',
      'classic-realtime',
    ]);
  });

  it('every default round-trips through parse', () => {
    for (const ruleset of everyDefault) {
      expect(RulesetSchema.parse(ruleset)).toEqual(ruleset);
    }
  });

  it('royale defaults carry stages, jackpot and seasonComplete', () => {
    for (const ruleset of [royaleRealtimeDefault, royaleAsyncDefault]) {
      expect(ruleset.stages).toBeDefined();
      expect(ruleset.jackpot).toBeDefined();
      expect(ruleset.seasonComplete).toBeDefined();
      expect(ruleset.defaultPrizes).toBeUndefined();
      expect(ruleset.countsForLeaderboard).toBe(true);
    }
  });

  it('royale defaults multiply no stage: stageMultiplier 1 everywhere (D11)', () => {
    for (const ruleset of [royaleRealtimeDefault, royaleAsyncDefault]) {
      expect(ruleset.stages?.map((s) => s.stageMultiplier)).toEqual([1, 1, 1]);
    }
  });

  it('classic defaults carry defaultPrizes and no stages/jackpot', () => {
    for (const ruleset of [classicSeasonsRealtimeDefault, classicRealtimeDefault]) {
      expect(ruleset.stages).toBeUndefined();
      expect(ruleset.jackpot).toBeUndefined();
      expect(ruleset.seasonComplete).toBeUndefined();
      expect(ruleset.defaultPrizes).toEqual([...DEFAULT_PRIZE_SELECTION]);
      expect(ruleset.countsForLeaderboard).toBe(false);
    }
  });
});

describe('RulesetSchema — cross-field validation', () => {
  it('rejects a royale that lacks stages', () => {
    const invalid = { ...royaleRealtimeDefault, stages: undefined };
    const result = RulesetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.some((issue) => issue.path.join('.') === 'stages')).toBe(true);
  });

  it('rejects a royale that ticks defaultPrizes', () => {
    const invalid = { ...royaleRealtimeDefault, defaultPrizes: ['rows-1'] };
    const result = RulesetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a classic ruleset that still has stages', () => {
    const invalid = {
      ...classicRealtimeDefault,
      stages: royaleRealtimeDefault.stages,
    };
    const result = RulesetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a classic ruleset without defaultPrizes', () => {
    const invalid = { ...classicRealtimeDefault, defaultPrizes: undefined };
    const result = RulesetSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects a royale whose last stage is not "final"', () => {
    const stages = royaleRealtimeDefault.stages?.map((stage) =>
      stage.kind === 'final' ? { ...stage, kind: 'elimination' as const } : stage,
    );
    const invalid = { ...royaleRealtimeDefault, stages };
    expect(RulesetSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a speed window that is at least as long as the realtime interval', () => {
    const invalid: Ruleset = {
      ...royaleRealtimeDefault,
      marking: { mode: 'manual', speedWindowMs: 10_000 },
      draws: { ...royaleRealtimeDefault.draws, intervalMsRealtime: 5_000 },
    };
    expect(RulesetSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects duplicate prize entries', () => {
    const invalid = {
      ...classicRealtimeDefault,
      defaultPrizes: ['rows-1', 'rows-1'],
    };
    expect(RulesetSchema.safeParse(invalid).success).toBe(false);
  });
});
