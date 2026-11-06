// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/fullLobby.test.tsx
 * @module web/game
 * @brief  A full lobby says "Full" everywhere and offers no Join; watching stays (FULL-LOBBY).
 *
 * Responsibility: a lobby whose places are all taken (the server's `full`) and that is not
 *                 counting down reads "Full" on the lobby card, in the waiting room, in the
 *                 host's console and in My matches; neither the card nor the waiting room shows
 *                 a Join button, the card keeps Watch. A countdown still reads "Starting…".
 * Depends on:     @testing-library/react, @sbr/contracts (types), ./Lobby, ./MatchScreen,
 *                 ./MyMatches, ./labels, ../host/HostConsole, ../test/matchFixture
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.2, §2.3
 */
import type { MyMatch } from '@sbr/contracts';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostConsole } from '../host/HostConsole.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { statusName } from './labels.js';
import { Lobby } from './Lobby.js';
import { MatchScreen } from './MatchScreen.js';
import { myMatchState } from './MyMatches.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FULL = { players: 8, maxPlayers: 8, full: true };

const mine: MyMatch = {
  code: 'MATCH1',
  title: 'Match',
  mode: 'realtime',
  status: 'lobby',
  startsAt: null,
  startAt: null,
  startsWhenFull: false,
  full: true,
  lobbyClosesAt: null,
  roundIndex: null,
  cutsSurvived: 0,
  outInCut: null,
  news: false,
};

describe('a full lobby', () => {
  it('reads "Full" on the lobby card and in My matches, with Watch and no Join', async () => {
    serveMatch(matchSummary(FULL), undefined, null, [mine]);
    await show(<Lobby />);
    const card = screen.getByTestId('lobby-match-MATCH1');
    expect(card.textContent).toContain('Full');
    expect(card.textContent).not.toContain('Open to join');
    expect(screen.queryByTestId('join-MATCH1')).toBeNull();
    expect(card.textContent).toContain('Watch');
    expect(screen.getByTestId('my-match-state-MATCH1').textContent).toBe(
      'Full · Waiting for the host',
    );
  });

  it('reads "Full" in the waiting room, without the Join button', async () => {
    serveMatch(matchSummary(FULL));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('registration').textContent).toBe('Full · the host starts the match');
    expect(screen.queryByTestId('join-match')).toBeNull();
  });

  it('reads "Full" in the host\'s console', async () => {
    serveMatch(matchSummary({ ...FULL, youHost: true }));
    await show(<HostConsole code="MATCH1" />);
    expect(screen.getByTestId('host-status').textContent).toBe('Full');
    expect(screen.getByTestId('host-start-rule').textContent).toBe(
      'Full · the host starts the match',
    );
  });

  it('still reads "Starting…" while the countdown runs', () => {
    expect(statusName({ status: 'lobby', startsAt: Date.now() + 9_000, full: true })).toBe(
      'Starting…',
    );
    expect(statusName({ status: 'lobby', startsAt: null, full: true })).toBe('Full');
    expect(myMatchState({ ...mine, startsAt: Date.now() + 9_000 }, Date.now())).toBe('Starting…');
  });
});
