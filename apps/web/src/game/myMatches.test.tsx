// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/myMatches.test.tsx
 * @module web/game
 * @brief  The lobby's "My matches": the player's matches that are not over, in words (D39).
 *
 * Responsibility: the lobby shows "My matches" above the list with title, pace and where each
 *                 match stands, and "Open" in this tab; with none the section is hidden. The
 *                 words: "Waiting for the host", "Waiting for players", "Starts at 22:25",
 *                 "Starts or closes at …", "Starting…", "Round 1", "Round 2 · you're through",
 *                 "Out in cut 1 · watching". The lobby list and My matches come in one answer
 *                 (one request per refresh), so a starting match says "Starting…" in both.
 * Depends on:     @testing-library/react, @sbr/contracts (types), ./Lobby, ./MyMatches,
 *                 ../test/matchFixture
 * Spec:           docs/spec/01-game-design.md §13 (D39); docs/spec/05-api-design.md §2.2
 */
import type { MyMatch } from '@sbr/contracts';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { Lobby } from './Lobby.js';
import { myMatchState } from './MyMatches.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date(2026, 10, 2, 21, 0).getTime();
const AT = new Date(2026, 10, 2, 22, 25).getTime();

function mine(over: Partial<MyMatch> = {}): MyMatch {
  return {
    code: 'MINE01',
    title: 'Evening royale',
    mode: 'realtime',
    status: 'lobby',
    startsAt: null,
    startAt: null,
    startsWhenFull: false,
    full: false,
    lobbyClosesAt: null,
    roundIndex: null,
    cutsSurvived: 0,
    outInCut: null,
    ...over,
  };
}

describe('my matches in the lobby (D39)', () => {
  it("lists the player's matches with pace and state, and opens one in this tab", async () => {
    const slow = mine({
      code: 'SLOW01',
      title: 'Slow royale',
      mode: 'async',
      status: 'running',
      roundIndex: 1,
      cutsSurvived: 1,
    });
    serveMatch(matchSummary(), undefined, null, [slow, mine()]);
    await show(<Lobby />);
    const section = screen.getByTestId('my-matches');
    expect(section.textContent).toContain("Slow royale · Asynchronous · Round 2 · you're through");
    expect(screen.getByTestId('my-match-MINE01').textContent).toContain(
      'Evening royale · Realtime · Waiting for the host',
    );
    const open = screen.getByTestId('my-open-SLOW01');
    expect(open.getAttribute('href')).toBe('#/match/SLOW01');
    expect(open.getAttribute('target')).toBeNull();
  });

  it('comes with the lobby list in one answer, so both show the same state', async () => {
    const starting = matchSummary({ code: 'MINE01', startsAt: NOW + 9_000 });
    const fetch = serveMatch(starting, undefined, null, [mine({ startsAt: NOW + 9_000 })]);
    await show(<Lobby />);
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.endsWith('/matches'))).toHaveLength(1);
    expect(urls.some((u) => u.endsWith('/me/matches'))).toBe(false);
    expect(screen.getByTestId('my-match-MINE01').textContent).toContain('Starting…');
    expect(screen.getByTestId('lobby-match-MINE01').textContent).toContain('Starting…');
    expect(screen.getByTestId('lobby-match-MINE01').textContent).not.toContain('Open to join');
  });

  it('is hidden without own matches', async () => {
    serveMatch(matchSummary());
    await show(<Lobby />);
    expect(screen.queryByTestId('my-matches')).toBeNull();
  });

  it('says where each match stands', () => {
    expect(myMatchState(mine({ startsWhenFull: true }), NOW)).toBe('Waiting for players');
    expect(myMatchState(mine({ startAt: AT }), NOW)).toBe('Starts at 22:25');
    expect(myMatchState(mine({ mode: 'async', lobbyClosesAt: AT }), NOW)).toBe(
      'Starts or closes at 22:25',
    );
    expect(myMatchState(mine({ startsAt: NOW + 9_000 }), NOW)).toBe('Starting…');
    const running = mine({ status: 'running', roundIndex: 0 });
    expect(myMatchState(running, NOW)).toBe('Round 1');
    expect(myMatchState({ ...running, roundIndex: 2, cutsSurvived: 1, outInCut: 2 }, NOW)).toBe(
      'Out in cut 2 · watching',
    );
  });
});
