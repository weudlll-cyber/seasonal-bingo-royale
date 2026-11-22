/**
 * @file   packages/contracts/src/config/screens.ts
 * @module contracts/config
 * @brief  "Screens and texts": what players see that is not a rule — list sizes, times, refresh.
 *
 * Responsibility: the `screens` settings document (admin-area §4 "Screens and texts", §8 (i)):
 *                 the player client's values (standings and final placement rows, recent-event
 *                 lines, when the final notice goes, a recap card's time, how often the lobby
 *                 and the maintenance state are asked for), which the server sends in the
 *                 session answer so they apply at the players' next page load, and the server's
 *                 list sizes (matches in the lobby, a leaderboard page and the rows around a
 *                 player, a profile's recent matches, the open sign-ups for the website); their
 *                 bounds (admin-values.md parts C and D), names, what each does, defaults
 *                 (today's values) and `screenSettingsOf`, the stored document over the defaults.
 * Depends on:     zod, ./presetCatalogue (types)
 * Used by:        ../index; apps/server (session answer, lists, admin Screens), apps/web
 * Spec:           docs/concepts/admin-area.md §4, §8 (i), §9 piece 6; admin-values.md C, D
 */
import { z } from 'zod';

import type { Entry } from './presetCatalogue.js';

const count = (min: number, max: number) => z.number().int().min(min).max(max);

export const ScreenSettingsSchema = z.strictObject({
  standingsRows: count(5, 200),
  finalPlacementRows: count(5, 200),
  recentEventLines: count(1, 10),
  finalNoticeDraws: count(1, 10),
  recapCardMs: count(3_000, 15_000),
  lobbyRefreshMs: count(1_000, 60_000),
  maintenancePollMs: count(5_000, 300_000),
  matchList: count(10, 200),
  leaderboardPage: count(10, 200),
  leaderboardAround: count(1, 25),
  profileRecentMatches: count(1, 50),
  openRounds: count(1, 100),
});
export type ScreenSettings = z.infer<typeof ScreenSettingsSchema>;

export const SCREEN_DEFAULTS: ScreenSettings = {
  standingsRows: 20,
  finalPlacementRows: 20,
  recentEventLines: 3,
  finalNoticeDraws: 3,
  recapCardMs: 5_000,
  lobbyRefreshMs: 3_000,
  maintenancePollMs: 30_000,
  matchList: 50,
  leaderboardPage: 50,
  leaderboardAround: 5,
  profileRecentMatches: 10,
  openRounds: 20,
};

// The values the player client reads; the server sends these in the session answer.
export const CLIENT_SCREEN_KEYS = [
  'standingsRows',
  'finalPlacementRows',
  'recentEventLines',
  'finalNoticeDraws',
  'recapCardMs',
  'lobbyRefreshMs',
  'maintenancePollMs',
] as const;
export type ClientScreens = Pick<ScreenSettings, (typeof CLIENT_SCREEN_KEYS)[number]>;

export function screenSettingsOf(document: Readonly<Record<string, unknown>>): ScreenSettings {
  const p = ScreenSettingsSchema.safeParse({ ...SCREEN_DEFAULTS, ...document });
  return p.success ? p.data : SCREEN_DEFAULTS;
}

export const clientScreensOf = (s: ScreenSettings): ClientScreens =>
  Object.fromEntries(CLIENT_SCREEN_KEYS.map((k) => [k, s[k]])) as ClientScreens;

const RELOAD = ' Players see it after their next page load.';

export const SCREEN_CATALOGUE: Readonly<Record<keyof ScreenSettings, Entry>> = {
  standingsRows: {
    label: 'Standings rows',
    description: `Players listed in the live standings (the player's own row always shows).${RELOAD}`,
    unit: 'rows',
  },
  finalPlacementRows: {
    label: 'Final placement rows',
    description: `Players listed below the podium at the end (own row always shows).${RELOAD}`,
    unit: 'rows',
  },
  recentEventLines: {
    label: 'Recent events',
    description: `Lines of what just happened beside the card.${RELOAD}`,
    unit: 'lines',
  },
  finalNoticeDraws: {
    label: 'Final notice',
    description: `The "Final" notice goes after this many numbers of the final.${RELOAD}`,
    unit: 'numbers',
  },
  recapCardMs: {
    label: 'Recap card time',
    description: `How long each card of the recap between royale rounds shows at least.${RELOAD}`,
    unit: 's',
    scale: 1000,
  },
  lobbyRefreshMs: {
    label: 'Lobby refresh',
    description: `How often the lobby asks for the open matches.${RELOAD}`,
    unit: 's',
    scale: 1000,
    warning: 'Shorter times put more load on the server.',
  },
  maintenancePollMs: {
    label: 'Maintenance check',
    description: `How often an open page asks whether maintenance is on.${RELOAD}`,
    unit: 's',
    scale: 1000,
  },
  matchList: {
    label: 'Matches in the lobby',
    description: 'The most open, running and recent matches the lobby lists. Applies at once.',
    unit: 'matches',
  },
  leaderboardPage: {
    label: 'Leaderboard page',
    description: 'Rows per page of a leaderboard. Applies at once.',
    unit: 'rows',
  },
  leaderboardAround: {
    label: 'Rows around a player',
    description: 'Rows above and below a player who looks for their own place. Applies at once.',
    unit: 'rows',
  },
  profileRecentMatches: {
    label: 'Recent matches on a profile',
    description: 'Finished matches a profile lists. Applies at once.',
    unit: 'matches',
  },
  openRounds: {
    label: 'Open sign-ups for the website',
    description: 'The most open sign-ups the website is sent. Applies at once.',
    unit: 'sign-ups',
  },
};
