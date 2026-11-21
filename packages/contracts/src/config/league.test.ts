/**
 * @file   packages/contracts/src/config/league.test.ts
 * @module contracts/config
 * @brief  The League settings: today's table by default, bounds from the schema, corrections.
 *
 * Spec:   docs/concepts/admin-area.md §4 (League), §9 piece 5
 */
import { describe, expect, it } from 'vitest';

import { LEADERBOARD_DEFAULTS } from './defaults/leaderboard.js';
import {
  CorrectionSchema,
  LEAGUE_CATALOGUE,
  LEAGUE_DEFAULTS,
  leagueConfigOf,
  leagueSettingsOf,
  LeagueSettingsSchema,
} from './league.js';
import { settingsFields } from './settingsFields.js';

describe('the League settings (admin-area §4)', () => {
  it('make today’s league table when nothing is changed', () => {
    expect(leagueConfigOf(LEAGUE_DEFAULTS)).toEqual(LEADERBOARD_DEFAULTS);
    expect(leagueSettingsOf({})).toEqual(LEAGUE_DEFAULTS);
  });

  it('take a changed value over the default and put it in its band', () => {
    const s = leagueSettingsOf({ place1: 150, finalistBonus: 0 });
    const config = leagueConfigOf(s);
    expect(config.placementPoints[0]).toEqual({ from: 1, to: 1, points: 150 });
    expect(config.finalistBonus).toBe(0);
    expect(leagueSettingsOf({ place1: 5_000 })).toEqual(LEAGUE_DEFAULTS);
  });

  it('get their fields with the bounds of the schema', () => {
    const fields = settingsFields(LeagueSettingsSchema, LEAGUE_DEFAULTS, LEAGUE_CATALOGUE);
    expect(fields.find((f) => f.path === 'place1')).toMatchObject({
      min: 0,
      max: 1_000,
      unit: 'points',
    });
    expect(fields.find((f) => f.path === 'minPlayersForPoints')).toMatchObject({
      min: 2,
      max: 200,
    });
    expect(fields.find((f) => f.path === 'requireVerifiedPlayers')?.kind).toBe('boolean');
  });

  it('refuse a correction without a delta or a reason', () => {
    const ok = { displayName: 'dev-player-1', delta: -20, reason: 'Played two accounts' };
    expect(CorrectionSchema.safeParse(ok).success).toBe(true);
    expect(CorrectionSchema.safeParse({ ...ok, delta: 0 }).success).toBe(false);
    expect(CorrectionSchema.safeParse({ ...ok, reason: ' ' }).success).toBe(false);
  });
});
