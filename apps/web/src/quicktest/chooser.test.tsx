// @vitest-environment jsdom
/**
 * @file   apps/web/src/quicktest/chooser.test.tsx
 * @module web/quicktest
 * @brief  The test page is a chooser: two ways to test, each on its own sub-route.
 *
 * Responsibility: #/quicktest shows the heading, one sentence and the two choices ("Play a
 *                 test match" → #/quicktest/play, "Check a game by seed" → #/quicktest/seed)
 *                 and neither way itself; each sub-route shows only its own way, the seed
 *                 check under "Seed check (simulation)".
 * Depends on:     @testing-library/react, ../App, ../shell/session, ../shell/router
 * Spec:           docs/spec/15-implementation-plan.md WP-08; docs/spec/01-game-design.md §13
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';

vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

beforeEach(() => {
  const session = { signedIn: false, account: null, permissions: [], csrfToken: 'x' };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(session)))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function showPage(view?: 'play' | 'seed'): Promise<void> {
  render(
    <SessionProvider>
      <App view={view} />
    </SessionProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('the test page', () => {
  it('reads its sub-routes from the address', () => {
    expect(parseRoute('#/quicktest')).toEqual({ name: 'quicktest' });
    expect(parseRoute('#/quicktest/play')).toEqual({ name: 'quicktest', view: 'play' });
    expect(parseRoute('#/quicktest/seed')).toEqual({ name: 'quicktest', view: 'seed' });
  });

  it('offers the two ways to test and shows neither yet', async () => {
    await showPage();
    expect(screen.getByRole('heading', { name: 'Test a match' })).toBeTruthy();
    const play = screen.getByRole('link', { name: /Play a test match/ });
    const seed = screen.getByRole('link', { name: /Check a game by seed/ });
    expect(play.getAttribute('href')).toBe('#/quicktest/play');
    expect(seed.getAttribute('href')).toBe('#/quicktest/seed');
    expect(screen.queryByTestId('test-match')).toBeNull();
    expect(screen.queryByTestId('simulation')).toBeNull();
  });

  it('shows only the test match on its sub-route', async () => {
    await showPage('play');
    expect(screen.getByTestId('test-match')).toBeTruthy();
    expect(screen.queryByTestId('simulation')).toBeNull();
  });

  it('shows only the seed check, as a simulation, on its sub-route', async () => {
    await showPage('seed');
    expect(screen.getByRole('heading', { name: 'Seed check (simulation)' })).toBeTruthy();
    expect(screen.getByTestId('simulation').textContent).toContain('not a live game');
    expect(screen.queryByTestId('test-match')).toBeNull();
  });
});
