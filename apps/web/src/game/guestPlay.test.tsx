// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/guestPlay.test.tsx
 * @module web/game
 * @brief  A website guest watches; Join becomes "Sign in to join", to the website login (2026-11-04).
 *
 * Responsibility: in website mode a visitor without an account (a watch-only guest session)
 *                 sees "Sign in to join" instead of Join on the lobby card and in the waiting
 *                 room, linking to <base>auth/website/login with the page as `next` (D43);
 *                 Watch stays. In local mode a signed-out visitor sees no such link.
 * Depends on:     @testing-library/react, ./Lobby, ./MatchScreen, ../test/matchFixture
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/05-api-design.md §2.1
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { Lobby } from './Lobby.js';
import { MatchScreen } from './MatchScreen.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

const guest = (mode: 'local' | 'website') => ({
  signedIn: false,
  kind: 'guest',
  account: null,
  permissions: ['match.watch'],
  csrfToken: 'x',
  features: { guests: true },
  authMode: mode,
  ...(mode === 'website' ? { signInPath: '/games/bingo/auth/website' } : {}),
});

const LOGIN = '/games/bingo/auth/website/login?next=';

// The fixture's answers for this visitor: its session, and a match it plays not in.
function serveAs(session: object): void {
  const answers = serveMatch(matchSummary()) as unknown as (url: string) => Promise<Response>;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/session')) return new Response(JSON.stringify(session));
      const body = (await (await answers(url)).json()) as Record<string, unknown>;
      return new Response(JSON.stringify('me' in body ? { ...body, me: null } : body));
    }),
  );
}

describe('a website guest', () => {
  it('gets "Sign in to join" on the lobby card, to the website login, and keeps Watch', async () => {
    window.location.hash = '#/';
    serveAs(guest('website'));
    await show(<Lobby />);
    expect(screen.queryByTestId('join-MATCH1')).toBeNull();
    const link = screen.getByTestId('sign-in-to-join-MATCH1');
    expect(link.getAttribute('href')).toBe(`${LOGIN}${encodeURIComponent('/games/bingo/#/')}`);
    expect(screen.getByTestId('lobby-match-MATCH1').textContent).toContain('Watch');
  });

  it('gets "Sign in to join" in the waiting room, back to this match', async () => {
    window.location.hash = '#/match/MATCH1';
    serveAs(guest('website'));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.queryByTestId('join-match')).toBeNull();
    expect(screen.getByTestId('sign-in-to-join').getAttribute('href')).toBe(
      `${LOGIN}${encodeURIComponent('/games/bingo/#/match/MATCH1')}`,
    );
  });

  it('is not offered in local mode', async () => {
    serveAs(guest('local'));
    await show(<Lobby />);
    expect(screen.queryByTestId('sign-in-to-join-MATCH1')).toBeNull();
  });
});
