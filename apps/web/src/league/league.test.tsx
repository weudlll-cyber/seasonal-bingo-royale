// @vitest-environment jsdom
/**
 * @file   apps/web/src/league/league.test.tsx
 * @module web/league
 * @brief  Leaderboard, profile and account pages show what the server sends; names link to profiles.
 *
 * Responsibility: the routes #/leaderboard[/<period>], #/players/<name> and #/account; the
 *                 board lists the server's rows in its order with the own row marked, names
 *                 linking to profiles, a period selector, and the counting rule when empty; the
 *                 profile shows the figures and each recent match with whether it counted; the
 *                 account page deletes only after a confirmation with the password; live
 *                 standings link human players, never bots or deleted players.
 * Depends on:     @testing-library/react, @sbr/contracts (types), ./LeaderboardPage, ./ProfilePage,
 *                 ./playerHref, ../account/AccountPage, ../components/RankRow, ../shell/router,
 *                 ../shell/session
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/05-api-design.md §2.2, §2.4
 */
import type { LeaderboardPage as Page, LeaderboardPeriod, PlayerProfile } from '@sbr/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountPage } from '../account/AccountPage.js';
import { RankRow } from '../components/RankRow.js';
import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { LeaderboardPage } from './LeaderboardPage.js';
import { playerHref } from './playerHref.js';
import { ProfilePage } from './ProfilePage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SEASON: LeaderboardPeriod = {
  id: 'p-season',
  kind: 'season',
  name: 'Autumn 2026',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2027-01-01T00:00:00.000Z',
  status: 'active',
  minPlayers: 8,
};
const ALL_TIME: LeaderboardPeriod = {
  ...SEASON,
  id: 'p-all',
  kind: 'all_time',
  name: 'All time',
  endsAt: null,
};
const row = (rank: number, name: string, isYou = false) => ({
  rank,
  displayName: name,
  points: 200 - rank,
  wins: 1,
  seasonCompletes: 0,
  isYou,
});
const SESSION = {
  signedIn: true,
  account: { id: 'a', displayName: 'carla' },
  permissions: ['match.join'],
  csrfToken: 'x',
};

// Answers by path; returns the stub to read the calls.
function serve(answers: Record<string, unknown>) {
  const stub = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    const body = answers[path];
    return Promise.resolve(
      body === undefined
        ? new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 })
        : new Response(body === null ? null : JSON.stringify(body), {
            status: body === null ? 204 : 200,
          }),
    );
  });
  vi.stubGlobal('fetch', stub);
  return stub;
}

async function show(element: React.ReactElement): Promise<void> {
  render(<SessionProvider>{element}</SessionProvider>);
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('routes', () => {
  it('maps the leaderboard, profile and account hashes', () => {
    expect(parseRoute('#/leaderboard')).toEqual({ name: 'leaderboard', periodId: null });
    expect(parseRoute('#/leaderboard/p-all')).toEqual({ name: 'leaderboard', periodId: 'p-all' });
    expect(parseRoute('#/players/dev-player-1')).toEqual({
      name: 'player',
      displayName: 'dev-player-1',
    });
    expect(parseRoute('#/account')).toEqual({ name: 'account' });
    expect(hrefOf({ name: 'player', displayName: 'Zoë' })).toBe('#/players/Zo%C3%AB');
    expect(parseRoute(hrefOf({ name: 'player', displayName: 'Zoë' }))).toEqual({
      name: 'player',
      displayName: 'Zoë',
    });
    expect(hrefOf({ name: 'leaderboard', periodId: null })).toBe('#/leaderboard');
  });
});

describe('the leaderboard page (01 §10)', () => {
  it('shows the season board in the server order, the own row marked, names linked', async () => {
    const page: Page = {
      period: SEASON,
      items: [row(1, 'anna'), row(2, 'carla', true), row(3, 'bob')],
      nextCursor: null,
    };
    serve({
      '/session': SESSION,
      '/leaderboards': { items: [SEASON, ALL_TIME] },
      '/leaderboards/p-season': page,
    });
    await show(<LeaderboardPage periodId={null} />);
    const rows = screen.getAllByTestId(/^league-row-/);
    expect(rows.map((r) => r.dataset['name'])).toEqual(['anna', 'carla', 'bob']);
    expect(rows[1]?.className).toContain('is-own');
    expect(screen.getByRole('link', { name: 'anna' }).getAttribute('href')).toBe('#/players/anna');
    const select = screen.getByTestId<HTMLSelectElement>('leaderboard-period');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Autumn 2026', 'All time']);
  });

  it('explains the counting rule when nobody has league points yet', async () => {
    serve({
      '/session': SESSION,
      '/leaderboards': { items: [ALL_TIME] },
      '/leaderboards/p-all': { period: ALL_TIME, items: [], nextCursor: null },
      '/leaderboards/p-all/me': { period: ALL_TIME, items: [] },
    });
    await show(<LeaderboardPage periodId="p-all" />);
    expect(screen.getByTestId('leaderboard-empty').textContent).toContain(
      'at least 8 players with a confirmed e-mail address and no bots',
    );
  });
});

describe('the profile page (05 §2.2)', () => {
  it('shows the figures and whether each recent match counted', async () => {
    const profile: PlayerProfile = {
      displayName: 'carla',
      matchesPlayed: 3,
      wins: 1,
      bestPlacement: 1,
      seasonCompletes: 2,
      badges: [{ id: 'season-complete', name: 'Season Complete', count: 2 }],
      recentMatches: [
        {
          code: 'ABC',
          title: 'Friday',
          finishedAt: '2026-10-30T20:00:00.000Z',
          place: 2,
          players: 9,
          league: 'bots',
        },
      ],
    };
    serve({ '/session': SESSION, '/players/carla': profile });
    await show(<ProfilePage displayName="carla" />);
    expect(screen.getByTestId('profile-matches').textContent).toBe('3');
    expect(screen.getByTestId('profile-best').textContent).toBe('#1');
    expect(screen.getByTestId('profile-badges').textContent).toContain('Season Complete ×2');
    const match = screen.getByTestId('profile-match-ABC');
    expect(match.textContent).toContain('#2 of 9');
    expect(match.dataset['league']).toBe('bots');
    expect(match.textContent).toContain('No league points: bots played');
  });

  it('says when there is no such player', async () => {
    serve({ '/session': SESSION });
    await show(<ProfilePage displayName="nobody" />);
    expect(screen.getByTestId('profile-missing')).toBeTruthy();
  });
});

describe('the account page (05 §2.2)', () => {
  it('deletes the account only after the confirmation, with the password', async () => {
    const stub = serve({ '/session': SESSION, '/me': null });
    await show(<AccountPage />);
    expect(screen.queryByTestId('delete-password')).toBeNull();
    fireEvent.click(screen.getByTestId('delete-account'));
    fireEvent.change(screen.getByTestId('delete-password'), { target: { value: 'secret pw' } });
    fireEvent.click(screen.getByTestId('delete-confirm'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const call = stub.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(call?.[0]).toMatch(/\/api\/v1\/me$/);
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({
      password: 'secret pw',
    });
    expect(screen.getByTestId('account-deleted')).toBeTruthy();
  });
});

describe('player links (01 §10)', () => {
  it('link human players, never bots or deleted players', () => {
    expect(playerHref('dev-player-1')).toBe('#/players/dev-player-1');
    expect(playerHref('bot-03')).toBeNull();
    expect(playerHref('deleted player 1a2b')).toBeNull();
  });

  it('a ranked row with a link shows the name as a link', () => {
    render(
      <ol>
        <RankRow
          rank={1}
          name="carla"
          href="#/players/carla"
          note="10 pts"
          seasons={null}
          own={false}
          out={false}
          attrs={{}}
        />
      </ol>,
    );
    expect(screen.getByRole('link', { name: 'carla' }).getAttribute('href')).toBe(
      '#/players/carla',
    );
  });
});
