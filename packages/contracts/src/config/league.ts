/**
 * @file   packages/contracts/src/config/league.ts
 * @module contracts/config
 * @brief  The League settings an admin may change, and the league points table they make.
 *
 * Responsibility: the `leaderboard` settings document (admin-area §4 "League"): league points
 *                 for each band of places (1st, 2nd, 3rd, 4th–10th, 11th–25th; the bands stay
 *                 fixed), the finalist and finish bonus, the fewest distinct players a match
 *                 needs for points and whether only players with a confirmed e-mail count;
 *                 their bounds (admin-values.md part A: 0–1000 points, 2–200 players), the
 *                 names and what changing each does, the defaults (today's
 *                 LEADERBOARD_DEFAULTS) and `leagueConfigOf`, the table the award code reads.
 *                 A correction's delta and reason (`CorrectionSchema`) are limited here too.
 * Depends on:     zod, ./defaults/leaderboard, ./limits, ./presetCatalogue (types)
 * Used by:        ../index; apps/server (awards, admin League), apps/web (admin League)
 * Spec:           docs/concepts/admin-area.md §4 (League), §9 piece 5; docs/spec/01-game-design.md §10
 */
import { z } from 'zod';

import { LEADERBOARD_DEFAULTS, type LeaderboardConfig } from './defaults/leaderboard.js';
import { LIMITS } from './limits.js';
import type { Entry } from './presetCatalogue.js';

const points = z.number().int().min(0).max(1_000);

export const LeagueSettingsSchema = z.strictObject({
  place1: points,
  place2: points,
  place3: points,
  places4to10: points,
  places11to25: points,
  finalistBonus: points,
  finishBonus: points,
  minPlayersForPoints: z.number().int().min(LIMITS.players.min).max(LIMITS.players.max),
  requireVerifiedPlayers: z.boolean(),
});
export type LeagueSettings = z.infer<typeof LeagueSettingsSchema>;

// The place bands, fixed; each band's points come from the setting of the same name.
const BANDS = [
  ['place1', 1, 1],
  ['place2', 2, 2],
  ['place3', 3, 3],
  ['places4to10', 4, 10],
  ['places11to25', 11, 25],
] as const;

const bandPoints = (from: number): number =>
  LEADERBOARD_DEFAULTS.placementPoints.find((b) => b.from === from)?.points ?? 0;

export const LEAGUE_DEFAULTS: LeagueSettings = {
  ...(Object.fromEntries(BANDS.map(([key, from]) => [key, bandPoints(from)])) as Pick<
    LeagueSettings,
    (typeof BANDS)[number][0]
  >),
  finalistBonus: LEADERBOARD_DEFAULTS.finalistBonus,
  finishBonus: LEADERBOARD_DEFAULTS.finishBonus,
  minPlayersForPoints: LEADERBOARD_DEFAULTS.minPlayersForPoints,
  requireVerifiedPlayers: LEADERBOARD_DEFAULTS.requireVerifiedPlayers,
};

// The stored document over the defaults (a value it leaves out is the default); the
// defaults when it does not parse.
export function leagueSettingsOf(document: Readonly<Record<string, unknown>>): LeagueSettings {
  const p = LeagueSettingsSchema.safeParse({ ...LEAGUE_DEFAULTS, ...document });
  return p.success ? p.data : LEAGUE_DEFAULTS;
}

export function leagueConfigOf(s: LeagueSettings): LeaderboardConfig {
  return {
    placementPoints: BANDS.map(([key, from, to]) => ({ from, to, points: s[key] })),
    finalistBonus: s.finalistBonus,
    finishBonus: s.finishBonus,
    minPlayersForPoints: s.minPlayersForPoints,
    requireVerifiedPlayers: s.requireVerifiedPlayers,
  };
}

const PLACE = 'League points for this place in a match that counts.';

export const LEAGUE_CATALOGUE: Readonly<Record<keyof LeagueSettings, Entry>> = {
  place1: { label: '1st place', description: PLACE, unit: 'points' },
  place2: { label: '2nd place', description: PLACE, unit: 'points' },
  place3: { label: '3rd place', description: PLACE, unit: 'points' },
  places4to10: { label: '4th to 10th place', description: PLACE, unit: 'points' },
  places11to25: { label: '11th to 25th place', description: PLACE, unit: 'points' },
  finalistBonus: {
    label: 'Finalist bonus',
    description: 'Extra league points for a royale player never put out by a cut.',
    unit: 'points',
  },
  finishBonus: {
    label: 'Finish bonus',
    description: 'Extra league points for every player with a final place.',
    unit: 'points',
  },
  minPlayersForPoints: {
    label: 'Fewest players for points',
    description: 'A match earns league points only with at least this many distinct players.',
    unit: 'players',
    warning: 'Lower numbers make small matches count for the league.',
  },
  requireVerifiedPlayers: {
    label: 'Only confirmed players count',
    description:
      'Count only players with a confirmed e-mail address towards the fewest players, where e-mail confirmation is on.',
  },
};

// A correction (admin-area §4): a delta of league points with a reason the player sees.
export const CorrectionSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(LIMITS.displayName.max),
  delta: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((d) => d !== 0),
  reason: z.string().trim().min(3).max(200),
});
