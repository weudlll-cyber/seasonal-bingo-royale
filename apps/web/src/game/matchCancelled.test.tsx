// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/matchCancelled.test.tsx
 * @module web/game
 * @brief  A match ended without a result shows its own end page to host and players (D17).
 *
 * Responsibility: after the host's abort and after a system abort, the player's match
 *                 screen and the host's console show "This match was cancelled by the host."
 *                 or "… by the system.", the reason, "Back to the lobby", "Verify this match"
 *                 (01 §9), and for the host
 *                 "Host another match" — never the arena; the lobby lists the cancelled match
 *                 with a link to that page.
 * Depends on:     @testing-library/react, vitest, ./MatchScreen, ./Lobby, ../host/HostConsole,
 *                 ../test/matchFixture, ../test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §13
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostConsole } from '../host/HostConsole.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { royaleFixture } from '../test/quickTestFixture.js';
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
});

// A match cancelled in its lobby, as the viewer (host or player) receives it.
function serveCancelled(by: 'host' | 'system', youHost: boolean): void {
  const view = royaleFixture();
  const events = [
    ...view.events.slice(0, 1),
    { type: 'matchAborted' as const, reason: 'Power cut in the hall', by },
  ];
  serveMatch(matchSummary({ status: 'aborted', title: 'Friday bingo', youHost }), {
    ...view,
    events,
  });
}

function page(): { by: string; reason: string; actions: string } {
  return {
    by: screen.getByTestId('cancelled-by').textContent,
    reason: screen.getByTestId('cancelled-reason').textContent,
    actions: screen.getByTestId('end-actions').textContent,
  };
}

describe('the cancelled-match page (D17)', () => {
  it.each(['host', 'system'] as const)('after an abort by the %s, for a player', async (by) => {
    serveCancelled(by, false);
    await show(<MatchScreen code="MATCH1" />);
    expect(page()).toEqual({
      by: `This match was cancelled by the ${by}.`,
      reason: 'Reason: Power cut in the hall',
      actions: 'Back to the lobbyVerify this match',
    });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Friday bingo');
    expect(screen.getByTestId('verify-link').getAttribute('href')).toBe('#/verify/MATCH1');
    expect(screen.queryByTestId('arena')).toBeNull();
    expect(screen.queryByText(/Waiting for the first number/)).toBeNull();
  });

  it.each(['host', 'system'] as const)('after an abort by the %s, for the host', async (by) => {
    serveCancelled(by, true);
    await show(<HostConsole code="MATCH1" />);
    expect(page()).toEqual({
      by: `This match was cancelled by the ${by}.`,
      reason: 'Reason: Power cut in the hall',
      actions: 'Host another matchBack to the lobbyVerify this match',
    });
    expect(screen.getByTestId('host-status').textContent).toBe('Cancelled');
    expect(screen.queryByTestId('standings')).toBeNull();
    expect(screen.queryByTestId('host-draw-next')).toBeNull();
  });

  it('is reached from the lobby', async () => {
    serveMatch(matchSummary({ status: 'aborted' }));
    await show(<Lobby />);
    const card = screen.getByTestId('lobby-match-MATCH1');
    expect(card.textContent).toContain('Cancelled');
    expect(card.querySelector('a[href="#/match/MATCH1"]')?.textContent).toBe('View');
  });
});
