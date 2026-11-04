/**
 * @file   apps/web/src/test/matchFixture.tsx
 * @module web
 * @brief  Test support: a match summary as the server sends it, and a served live match.
 *
 * Responsibility: `matchSummary` — an open royale match with host draws, changed by the
 *                 fields a test gives; `serveMatch` stubs fetch with the signed-in host's
 *                 session, the lobby list, the player's own matches, the away summary and the
 *                 live state of one match; `show` renders inside the session provider and lets
 *                 the first fetches settle. Test support only.
 * Depends on:     @testing-library/react, @sbr/contracts (types), ../game/useLiveMatch (types),
 *                 ./quickTestFixture,
 *                 ../shell/session
 * Used by:        the component tests (test helper)
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/12-testing-strategy.md §2
 */
import type { AwaySummary, MyMatch } from '@sbr/contracts';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

import type { MatchSummary } from '../game/useLiveMatch.js';
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

const HOST_SESSION = {
  signedIn: true,
  account: { id: 'h', displayName: 'dev-host' },
  permissions: ['match.join', 'match.create', 'match.manage'],
  csrfToken: 'x',
};

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
    if (url.endsWith('/session')) return HOST_SESSION;
    if (url.endsWith('/matches')) return { matches: [match], mine };
    if (url.endsWith('/away-summary')) return { summary: away };
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
