// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/serverClock.test.tsx
 * @module web/game
 * @brief  A countdown follows the server's clock, not the visitor's (kit K69).
 *
 * Responsibility: with the page's clock a minute behind the server's (the session answer names
 *                 the server's time), the waiting room counts the seconds the server means.
 * Depends on:     @testing-library/react, ./MatchScreen, ../test/matchFixture
 * Spec:           docs/spec/01-game-design.md §5; docs/spec/05-api-design.md §2.1
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchSummary, serveMatch, sessionAt, show } from '../test/matchFixture.js';
import { MatchScreen } from './MatchScreen.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a countdown on a wrong page clock', () => {
  it("shows the seconds left on the server's clock", async () => {
    // The server is a minute ahead of this page; the first round is 10 s away by its clock.
    const serverNow = Date.now() + 60_000;
    const match = matchSummary({ startsAt: serverNow + 10_000, status: 'lobby' });
    const answers = serveMatch(match) as unknown as (url: string) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.endsWith('/session')
          ? Promise.resolve(new Response(JSON.stringify(sessionAt(serverNow))))
          : answers(url),
      ),
    );
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('countdown').textContent).toContain('Starting in 10 s');
  });
});
