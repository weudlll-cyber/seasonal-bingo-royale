// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/noNameBadges.test.tsx
 * @module web
 * @brief  No step badges beside names in a match's standings and result rows (owner decision of
 *         2026-11-26).
 *
 * Responsibility: with every player's Discord steps in what the server sends, a running round's
 *                 standings and the final placement show the names alone, while the waiting room,
 *                 the leaderboard and a profile keep the badges (the header's are its own test).
 * Depends on:     @testing-library/react, @sbr/contracts (types), ./RankRow, ./StepBadges, ../game/MatchScreen,
 *                 ../league/LeaderboardPage, ../league/ProfilePage, ../test/matchFixture,
 *                 ../test/quickTestFixture
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import type { Step } from '@sbr/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatchScreen } from '../game/MatchScreen.js';
import { LeaderboardPage } from '../league/LeaderboardPage.js';
import { ProfilePage } from '../league/ProfilePage.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { royaleFixture } from '../test/quickTestFixture.js';
import { RankRow } from './RankRow.js';
import { StepsByName } from './StepBadges.js';

vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const STEPS: readonly Step[] = [
  {
    ladder: 'holder',
    name: 'Golden',
    icon: '/media/step-icons/0123456789abcdef0123456789abcdef.webp',
  },
];

// The fixture match with every player carrying steps, cut to its first `events` events.
function badged(events?: number) {
  const view = royaleFixture();
  return {
    ...view,
    events: view.events.slice(0, events),
    players: view.players.map((p) => ({ ...p, steps: STEPS })),
  };
}

const badges = () => document.querySelectorAll('img[src^="/media/step-icons/"]').length;

// The leaderboard's and a profile's answers, the player with the steps.
function serveLeague(): void {
  const period = {
    id: 'p',
    kind: 'season',
    name: 'Autumn 2026',
    status: 'active',
    minPlayers: 8,
  };
  const figures = { points: 10, wins: 1, seasonCompletes: 0 };
  const row = { rank: 1, displayName: 'carla', isYou: false, steps: STEPS, ...figures };
  const profile = {
    displayName: 'carla',
    steps: STEPS,
    matchesPlayed: 1,
    bestPlacement: 1,
    badges: [],
    recentMatches: [],
    corrections: [],
    ...figures,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = url.endsWith('/leaderboards')
        ? { items: [period] }
        : url.includes('/players/')
          ? profile
          : { items: [row], nextCursor: null };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
}

describe('step badges beside names', () => {
  it('shows none in the standings of a running round', async () => {
    serveMatch(matchSummary({ status: 'running' }), badged(2));
    await show(<MatchScreen code="MATCH1" />);
    expect(document.querySelectorAll('.standings-panel .rank-row').length).toBeGreaterThan(0);
    expect(badges()).toBe(0);
  });

  it('shows none in a result row, even where the names have their steps', () => {
    // The ranked rows below the podium are the same row as the standings'.
    render(
      <StepsByName players={badged(0).players}>
        <ul>
          <RankRow
            rank={4}
            name="owner-01"
            note="10 pts"
            seasons={null}
            own={false}
            out
            attrs={{}}
          />
        </ul>
      </StepsByName>,
    );
    expect(badges()).toBe(0);
  });

  it('keeps them in the waiting room', async () => {
    serveMatch(matchSummary(), badged(0));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('waiting-players').textContent).toContain('owner-01');
    expect(badges()).toBeGreaterThan(0);
  });

  it('keeps them on the leaderboard and on a profile', async () => {
    serveLeague();
    await show(<LeaderboardPage periodId={null} />);
    expect(await screen.findByTestId('league-row-carla')).toBeTruthy();
    expect(badges()).toBeGreaterThan(0);
    cleanup();
    await show(<ProfilePage displayName="carla" />);
    expect(await screen.findByTestId('profile-matches')).toBeTruthy();
    expect(badges()).toBeGreaterThan(0);
  });
});
