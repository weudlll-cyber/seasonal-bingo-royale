// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/wideScreens.test.tsx
 * @module web/game
 * @brief  The match screens on a wide page (owner decisions of 2026-11-28).
 *
 * Responsibility: between rounds the head row names the wait and offers the rules behind a
 *                 link, the rules line and the event lines are gone, the cut's strip has no
 *                 button, the recap's head reads "Title · lead" with the steps beside it, the
 *                 log opens over the screen and closes again, and the host's console keeps
 *                 "Start next round" in a column of its own.
 * Depends on:     @testing-library/react, @sbr/contracts (types), ../host/HostConsole,
 *                 ./MatchScreen, ../test/*
 * Spec:           docs/spec/01-game-design.md §13; docs/concepts/fit-audit.md §12
 */
import type { RoundRecap } from '@sbr/contracts';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HostConsole } from '../host/HostConsole.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { royaleFixture } from '../test/quickTestFixture.js';
import { MatchScreen } from './MatchScreen.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

const RECAP: RoundRecap = {
  roundIndex: 0,
  cut: { outCount: 3, out: ['p1', 'p2', 'p3'], saved: [] },
  facts: { numbersDrawn: 12, playersLeft: 11 },
};

// A desktop window: the desktop query matches, reduced motion does not.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(min-width: 960px)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function servePause(): void {
  const view = royaleFixture();
  serveMatch(matchSummary({ status: 'running', youHost: true, waitingForHost: true }), {
    ...view,
    events: view.events.slice(0, 11),
    recaps: [RECAP],
  });
}

describe('a wide page between rounds', () => {
  it('names the wait in the head row and keeps the rules behind a link', async () => {
    servePause();
    await show(<MatchScreen code="MATCH1" />);
    const head = screen.getByTestId('arena').querySelector('.match-head');
    expect(head?.textContent).toContain('Waiting for the host to start round 2');
    expect(screen.getByText('Match rules')).toBeTruthy();
    expect(screen.getByTestId('arena').querySelector('.arena-rules')).toBeNull();
    expect(screen.queryByTestId('recent-events')).toBeNull();
    expect(screen.queryByTestId('current-ball')).toBeNull();
  });

  it('heads the recap with the card and its lead, the steps beside it', async () => {
    servePause();
    await show(<MatchScreen code="MATCH1" />);
    const recap = screen.getByTestId('interlude');
    fireEvent.click(within(recap).getByTestId('interlude-next'));
    expect(recap.querySelector('h3')?.textContent).toBe('The cut · 3 players are out');
    expect(within(recap).getByTestId('interlude-prev')).toBeTruthy();
  });

  it('opens the whole match log over the screen and closes it again', async () => {
    servePause();
    await show(<MatchScreen code="MATCH1" />);
    fireEvent.click(screen.getByRole('button', { name: /Whole match log/ }));
    const sheet = screen.getByRole('dialog', { name: 'Whole match log' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("keeps the host's Start next round in a column apart from the recap", async () => {
    servePause();
    await show(<HostConsole code="MATCH1" />);
    const start = screen.getByTestId('host-next-round').closest('.wide-col');
    expect(start).not.toBeNull();
    expect(start?.contains(screen.getByTestId('interlude'))).toBe(false);
  });
});
