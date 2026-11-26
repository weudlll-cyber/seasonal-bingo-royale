/**
 * @file   apps/web/src/test/matchFixture.tsx
 * @module web
 * @brief  Test support: a match summary as the server sends it, and a served live match.
 *
 * Responsibility: `matchSummary`: an open royale match with host draws, changed by the given
 *                 fields; `serveMatch` stubs fetch with the signed-in host's session (with the
 *                 server's form limits), lobby list, own matches, away summary and one match's
 *                 live state; `show` renders in the session provider and lets the first fetches
 *                 settle; `serveWithLimits`/`showWithLimits` serve that session for a lone form;
 *                 `renderInSession` is for fake-timer tests. Both serve the published
 *                 `START_PRESETS`. Test support only.
 * Depends on:     @testing-library/react, @sbr/contracts (types), ../game/useLiveMatch (types),
 *                 ./quickTestFixture,
 *                 ../shell/session
 * Used by:        the component tests (test helper)
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/12-testing-strategy.md §2
 */
import { LIMITS, type AwaySummary, type MyMatch } from '@sbr/contracts';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

import type { MatchSummary } from '../game/useLiveMatch.js';
import type { StartPreset } from '../host/startForm.js';
import { royaleFixture } from './quickTestFixture.js';
import { SessionProvider } from '../shell/session.js';

export function matchSummary(over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: 'm',
    code: 'MATCH1',
    title: 'Match',
    gameType: 'royale',
    mode: 'realtime',
    status: 'lobby',
    players: 1,
    maxPlayers: 20,
    full: false,
    prizes: [],
    countsForLeaderboard: true,
    showOnWebsite: false,
    settings: {
      markingMode: 'manual',
      missedNumbers: { kind: 'noAutoMark' },
      drawMode: 'host',
      drawIntervalMs: 5000,
      roundPause: { kind: 'wait', ms: 6000 },
      startRule: { kind: 'host' },
      quietHours: null,
      timeZone: 'UTC',
    },
    startsAt: null,
    nextRoundAt: null,
    nextDrawAt: null,
    waitingForHost: false,
    minPlayers: 2,
    tooFewAtStart: false,
    lobbyClosesAt: null,
    quietUntil: null,
    youHost: false,
    ...over,
  };
}

// The published presets as GET /presets sends them: a live and an asynchronous royale and a
// classic one (admin-area §3).
const ROYALE_PRESET: StartPreset = {
  id: 'royale-realtime',
  name: 'Battle royale',
  gameType: 'royale',
  mode: 'realtime',
  description: 'About 45 min',
  players: { min: 4, max: 100, start: 20 },
  speedsMs: { relaxed: 8_000, normal: 5_000, quick: 4_000 },
  starts: { now: true, at: true, whenFull: false },
  countsForLeaderboard: true,
};
export const START_PRESETS: readonly StartPreset[] = [
  ROYALE_PRESET,
  {
    ...ROYALE_PRESET,
    id: 'royale-async',
    name: 'Asynchronous battle royale',
    mode: 'async',
    description: '',
    speedsMs: { relaxed: 1_800_000, normal: 900_000, quick: 300_000 },
  },
  {
    ...ROYALE_PRESET,
    id: 'classic-realtime',
    name: 'Classic',
    gameType: 'classic',
    countsForLeaderboard: false,
  },
];

// The server's form limits as the session answer carries them (admin-area §8 (m)).
const HOST_SESSION = {
  signedIn: true,
  account: { id: 'h', displayName: 'dev-host' },
  permissions: ['match.join', 'match.create', 'match.manage'],
  csrfToken: 'x',
  limits: LIMITS,
};

// The session answer, with the server's clock: the page's own unless a test names another.
export const sessionAt = (serverTime = Date.now()) => ({ ...HOST_SESSION, serverTime });

// Answers the session, the lobby list (this one match) with the player's own matches (none
// unless given, D39), the away summary (none unless given) and the match's live state;
// returns the fetch stub.
export function serveMatch(
  match: MatchSummary,
  view = royaleFixture(),
  away: AwaySummary | null = null,
  mine: readonly MyMatch[] = [],
): ReturnType<typeof vi.fn> {
  const answer = (url: string): unknown => {
    if (url.endsWith('/session')) return sessionAt();
    if (url.endsWith('/matches')) return { matches: [match], mine };
    if (url.endsWith('/away-summary')) return { summary: away };
    if (url.endsWith('/presets')) return { presets: START_PRESETS };
    return { match, seq: 0, since: 0, me: 'owner-01', view };
  };
  const fetch = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(answer(url)))));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

export async function show(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

type Answer = (url: string, init?: RequestInit) => unknown;

// The signed-in host's session with the server's limits; every other request answers
// `answer(url)` (an empty object unless given). Returns the fetch stub.
export function serveWithLimits(
  answer: Answer = (url) => (url.endsWith('/presets') ? { presets: START_PRESETS } : {}),
): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(url.endsWith('/session') ? sessionAt() : answer(url, init))),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

// Inside the session provider, for tests on fake timers: the session's answer arrives through
// promises only, so a few turns of the microtask queue let it settle (no timer runs).
export async function renderInSession(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  });
}

// A form on its own, inside the session provider with that session.
export async function showWithLimits(
  ui: React.ReactElement,
  answer?: Answer,
): Promise<ReturnType<typeof vi.fn>> {
  const fetch = serveWithLimits(answer);
  await show(ui);
  return fetch;
}
