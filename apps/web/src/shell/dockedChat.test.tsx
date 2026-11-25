// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/dockedChat.test.tsx
 * @module web/shell
 * @brief  The website's chat docked under the game in website mode (07 §6, K18).
 *
 * Responsibility: in website mode the lobby sits in the kit's docked screen with the chat in its
 *                 dock from the first render (no button to press): the frame loads
 *                 `/embed/chat?room=bingo&theme=light` on the site's origin, sandboxed (K17),
 *                 with the strict-origin referrer, follows a theme switch, and stays the same
 *                 element from the lobby to a match; on a phone the dock is the kit's bar. The
 *                 sign-in page has no dock. Standalone: no dock, no frame, no request for the
 *                 embed page, and none of the old side panel's parts.
 * Depends on:     @testing-library/react, ./AppShell, ./session
 * Spec:           docs/spec/07-integration-architecture.md §6
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { SessionProvider } from './session.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
  document.documentElement.removeAttribute('data-theme');
});

const CHAT = { path: '/embed/chat', room: 'bingo' };

// A server in that mode for a guest; the requests the client sent.
function serve(mode: 'local' | 'website'): string[] {
  const session = {
    signedIn: false,
    kind: 'guest',
    account: null,
    permissions: [],
    csrfToken: 'x',
    features: { guests: true },
    authMode: mode,
    ...(mode === 'website' ? { signInPath: '/games/bingo/auth/website', chat: CHAT } : {}),
  };
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      sent.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify(url.endsWith('/session') ? session : { matches: [], mine: [] }),
        ),
      );
    }),
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
  return sent;
}

async function renderShell(): Promise<void> {
  render(
    <SessionProvider>
      <AppShell dev={false} />
    </SessionProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

const frameSrc = (): string | null => screen.getByTestId('chat-frame').getAttribute('src');

describe("the website's chat docked under the game in website mode (07 §6)", () => {
  it('is in the dock from the first render, in the site frame, following the theme', async () => {
    serve('website');
    // As the early theme script does before the first paint.
    document.documentElement.setAttribute('data-theme', 'light');
    await renderShell();
    await screen.findByTestId('chat-frame');
    // The lobby sits in the docked screen; there is no button and no side panel.
    expect(screen.getByTestId('docked-screen').getAttribute('data-sk-view')).toBe('desktop');
    expect(screen.queryByTestId('chat-toggle')).toBeNull();
    expect(screen.queryByTestId('chat-panel')).toBeNull();
    // On the site's own origin; sandboxed (K17) and with the strict-origin referrer.
    expect(frameSrc()).toBe('/embed/chat?room=bingo&theme=light');
    const frame = screen.getByTestId('chat-frame');
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-forms allow-popups',
    );
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin');
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });
    expect(frameSrc()).toBe('/embed/chat?room=bingo&theme=dark');
  });

  it('stays the same frame from the lobby to a match', async () => {
    serve('website');
    await renderShell();
    const before = await screen.findByTestId('chat-frame');
    await act(async () => {
      window.location.hash = '#/match/ABC123';
      await Promise.resolve();
    });
    expect(screen.getByTestId('chat-frame')).toBe(before);
  });

  it('is the kit’s bar on a phone, the frame in the sheet it opens', async () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    serve('website');
    await renderShell();
    await screen.findByTestId('chat-bar');
    expect(screen.getByTestId('docked-screen').getAttribute('data-sk-view')).toBe('phone');
  });

  it('is not under the sign-in page', async () => {
    window.location.hash = '#/sign-in';
    serve('website');
    await renderShell();
    await screen.findByTestId('sign-in');
    expect(screen.queryByTestId('docked-screen')).toBeNull();
    expect(screen.queryByTestId('chat-frame')).toBeNull();
  });
});

describe('a standalone install (07 §6)', () => {
  it('has no dock, no frame and asks for no embed page', async () => {
    const sent = serve('local');
    await renderShell();
    await screen.findByTestId('sign-in');
    expect(screen.queryByTestId('docked-screen')).toBeNull();
    expect(screen.queryByTestId('chat-frame')).toBeNull();
    expect(sent.some((url) => url.includes('embed'))).toBe(false);
  });
});
