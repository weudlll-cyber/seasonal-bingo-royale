// @vitest-environment jsdom
/**
 * @file   apps/web/src/host/hostNav.test.tsx
 * @module web/host
 * @brief  The host finds the console again: Manage in the lobby, Your matches, host link (POLISH-1).
 *
 * Responsibility: the lobby shows "Manage" (to #/host/<code>) instead of Join for a match
 *                 the server says the viewer hosts, and the match code on every card; "Your
 *                 matches" lists only the viewer's open or running matches and is hidden
 *                 when there are none; "Open host console" shows only for the host; a player
 *                 on #/host/<code> sees no controls.
 * Depends on:     @testing-library/react, vitest, ../game/Lobby, ../game/HostLink, ./YourMatches, ./HostConsole
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §13
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostLink } from '../game/HostLink.js';
import { Lobby } from '../game/Lobby.js';
import type { MatchSummary } from '../game/useLiveMatch.js';
import { royaleFixture } from '../quickTestFixture.js';
import { SessionProvider } from '../shell/session.js';
import { HostConsole } from './HostConsole.js';
import { YourMatches } from './YourMatches.js';

vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function summary(code: string, over: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: code,
    code,
    title: `Match ${code}`,
    gameType: 'royale',
    status: 'lobby',
    players: 1,
    maxPlayers: 20,
    prizes: [],
    countsForLeaderboard: true,
    settings: {
      markingMode: 'manual',
      missedNumbers: { kind: 'noAutoMark' },
      drawMode: 'host',
      drawIntervalMs: 5000,
    },
    startsAt: null,
    createdBy: 'h',
    youHost: false,
    ...over,
  };
}

function serve(body: (url: string) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(body(url))))),
  );
}

const session = {
  signedIn: true,
  account: { id: 'h', displayName: 'dev-host' },
  permissions: ['match.join', 'match.create'],
  csrfToken: 'x',
};

async function show(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('lobby and your matches', () => {
  const matches = [
    summary('MINE01', { youHost: true }),
    summary('OTHER1'),
    summary('DONE01', { youHost: true, status: 'finished' }),
  ];

  it("shows Manage for the viewer's own match, Join for others, and every code", async () => {
    serve((url) => (url.endsWith('/session') ? session : { matches }));
    await show(<Lobby />);
    expect(screen.getByTestId('manage-MINE01').getAttribute('href')).toBe('#/host/MINE01');
    expect(screen.queryByTestId('join-MINE01')).toBeNull();
    expect(screen.getByTestId('join-OTHER1')).toBeTruthy();
    expect(screen.queryByTestId('manage-OTHER1')).toBeNull();
    expect(screen.getByTestId('code-OTHER1').textContent).toBe('Code OTHER1');
    expect(screen.queryByTestId('manage-DONE01')).toBeNull();
  });

  it('lists only open or running matches of the viewer, and hides itself when none', async () => {
    serve((url) => (url.endsWith('/session') ? session : { matches }));
    await show(<YourMatches />);
    expect(screen.getByTestId('your-manage-MINE01')).toBeTruthy();
    expect(screen.queryByTestId('your-manage-OTHER1')).toBeNull();
    expect(screen.queryByTestId('your-manage-DONE01')).toBeNull();
    cleanup();
    serve((url) => (url.endsWith('/session') ? session : { matches: [summary('OTHER1')] }));
    await show(<YourMatches />);
    expect(screen.queryByTestId('your-matches')).toBeNull();
  });
});

describe('host console and host link', () => {
  it('shows the host link only to the host', () => {
    const { rerender } = render(<HostLink match={summary('A', { youHost: true })} />);
    expect(screen.getByTestId('open-host-console').getAttribute('href')).toBe('#/host/A');
    rerender(<HostLink match={summary('A', { youHost: false })} />);
    expect(screen.queryByTestId('open-host-console')).toBeNull();
  });

  it('gives a player on #/host/<code> no controls', async () => {
    const view = royaleFixture();
    serve((url) =>
      url.endsWith('/session')
        ? session
        : { match: summary('XYZ'), seq: 0, since: 0, me: null, view },
    );
    await show(<HostConsole code="XYZ" />);
    expect(screen.getByTestId('not-your-match')).toBeTruthy();
    expect(screen.queryByTestId('start-match')).toBeNull();
    expect(screen.queryByTestId('host-draw-next')).toBeNull();
    expect(screen.queryByTestId('fill-bots')).toBeNull();
  });
});
