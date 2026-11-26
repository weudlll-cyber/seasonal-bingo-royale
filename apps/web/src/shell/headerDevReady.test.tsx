// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/headerDevReady.test.tsx
 * @module web/shell
 * @brief  The development header shows its account row only once every item in it is there.
 *
 * Responsibility: the "Dev sign-in" menu loads on demand; until it has, the account row stays
 *                 hidden (`data-session="loading"`), so "Sign in" never moves under a pointer
 *                 when the menu arrives (a click then landed on "Register": the e2e failure of
 *                 CI run 45701234922, e2e/account.spec).
 * Depends on:     @testing-library/react, ./AppShell, ./session, ./DevTools (held back)
 * Spec:           docs/spec/01-game-design.md §13
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { SessionProvider } from './session.js';

// The development tools' module, held back until the test lets it load.
const devTools = vi.hoisted(() => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release: () => release() };
});
vi.mock('./DevTools.js', async (original) => {
  await devTools.held;
  return original();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the development header's account row", () => {
  it('stays hidden until the dev sign-in menu is there', async () => {
    const guest = { signedIn: false, account: null, permissions: [], csrfToken: 'x' };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(JSON.stringify(url.endsWith('/session') ? guest : { matches: [] })),
        ),
      ),
    );
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    render(
      <SessionProvider>
        <AppShell dev />
      </SessionProvider>,
    );
    await screen.findByTestId('sign-in');
    const bar = document.querySelector('.sbr-header');
    // The session is known, the menu is not there yet.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByText('Dev sign-in')).toBeNull();
    expect(bar?.getAttribute('data-session')).toBe('loading');
    devTools.release();
    await waitFor(() => {
      expect(bar?.getAttribute('data-session')).toBe('known');
    });
    expect(screen.getByText('Dev sign-in')).toBeTruthy();
  });
});
