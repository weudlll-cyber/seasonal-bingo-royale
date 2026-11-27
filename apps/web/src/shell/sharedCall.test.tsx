// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/sharedCall.test.tsx
 * @module web/shell
 * @brief  The one shared call under the game in website mode, and the way back to it (kit K77).
 *
 * Responsibility: in website mode the dock holds the website's view of the shared call (hidden
 *                 until it says a call is live; the kit's part and its spec's browser check),
 *                 standalone frames nothing; the link back after a result shows only with a call.
 * Depends on:     @testing-library/react, ./AppShell, ./session, ./sharedCall
 * Spec:           docs/spec/07-integration-architecture.md §6; website GAME-INTEGRATION.md §9
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { SessionProvider } from './session.js';
import { ResultCallLink, SharedCallContext } from './sharedCall.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function renderShell(mode: 'local' | 'website'): Promise<void> {
  const session = {
    signedIn: false,
    account: null,
    permissions: [],
    csrfToken: 'x',
    authMode: mode,
    ...(mode === 'website' ? { chat: { path: '/embed/chat', room: 'bingo' } } : {}),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(url.endsWith('/session') ? session : { matches: [], mine: [] }),
        ),
      ),
    ),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  render(
    <SessionProvider>
      <AppShell dev={false} />
    </SessionProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

describe('the shared call (kit K77)', () => {
  it('is framed in the dock in website mode, hidden while nothing is live', async () => {
    await renderShell('website');
    const frame = await screen.findByTestId('shared-call-frame');
    expect(frame.getAttribute('src')).toContain('/embed/call/shared');
    expect(screen.queryByTestId('back-to-call')).toBeNull();
  });

  it('frames nothing in a standalone install', async () => {
    await renderShell('local');
    await screen.findByTestId('sign-in');
    expect(screen.queryByTestId('shared-call-frame')).toBeNull();
  });

  it('links back to a live call after a result, and shows nothing without one', () => {
    const { rerender } = render(
      <SharedCallContext.Provider value={7}>
        <ResultCallLink />
      </SharedCallContext.Provider>,
    );
    expect(screen.getByTestId('back-to-call').getAttribute('href')).toBe('/calls/7');
    rerender(<ResultCallLink />);
    expect(screen.queryByTestId('back-to-call')).toBeNull();
  });
});
