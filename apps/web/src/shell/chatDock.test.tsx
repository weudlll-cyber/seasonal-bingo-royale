// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/chatDock.test.tsx
 * @module web/shell
 * @brief  The website's chat beside the game in website mode (07 §6).
 *
 * Responsibility: in website mode the lobby's top bar has "Chat"; the frame does not exist
 *                 before the first opening, then loads `<origin>/embed/chat?room=bingo&theme=light`,
 *                 follows a theme switch, stays while the panel is closed, and the open state
 *                 is remembered (and read back on the next visit). The sign-in page has no
 *                 chat. Standalone: no button, no frame, no request for the embed page.
 * Depends on:     @testing-library/react, ./AppShell, ./session
 * Spec:           docs/spec/07-integration-architecture.md §6
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { SessionProvider } from './session.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
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

describe("the website's chat in website mode (07 §6)", () => {
  it('opens the room in a frame made on first opening, following the theme', async () => {
    serve('website');
    await renderShell();
    const toggle = await screen.findByTestId('chat-toggle');
    expect(screen.queryByTestId('chat-frame')).toBeNull();
    fireEvent.click(toggle);
    expect(frameSrc()).toBe(`${window.location.origin}/embed/chat?room=bingo&theme=light`);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });
    expect(frameSrc()).toBe(`${window.location.origin}/embed/chat?room=bingo&theme=dark`);
    fireEvent.click(screen.getByTestId('chat-close'));
    expect(screen.getByTestId('chat-panel').hidden).toBe(true);
    expect(screen.getByTestId('chat-frame')).toBeTruthy();
    expect(window.localStorage.getItem('sbr.chat.open')).toBe('false');
  });

  it('remembers an open panel for the next visit', async () => {
    window.localStorage.setItem('sbr.chat.open', 'true');
    serve('website');
    await renderShell();
    await screen.findByTestId('chat-toggle');
    expect(screen.getByTestId('chat-panel').hidden).toBe(false);
  });

  it('is not beside the sign-in page', async () => {
    window.location.hash = '#/sign-in';
    serve('website');
    await renderShell();
    await screen.findByTestId('open-sign-in');
    expect(screen.queryByTestId('chat-toggle')).toBeNull();
  });
});

describe('a standalone install (07 §6)', () => {
  it('has no chat button, no frame and asks for no embed page', async () => {
    window.localStorage.setItem('sbr.chat.open', 'true');
    const sent = serve('local');
    await renderShell();
    await screen.findByTestId('open-sign-in');
    expect(screen.queryByTestId('chat-toggle')).toBeNull();
    expect(screen.queryByTestId('chat-frame')).toBeNull();
    expect(sent.some((url) => url.includes('embed'))).toBe(false);
  });
});
