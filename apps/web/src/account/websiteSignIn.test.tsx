// @vitest-environment jsdom
/**
 * @file   apps/web/src/account/websiteSignIn.test.tsx
 * @module web/account
 * @brief  Website mode on the client: one "Sign in" to the website, no forms (D37).
 *
 * Responsibility: when the server says `authMode: 'website'`, the top bar shows one "Sign in"
 *                 that opens the server's website sign-in route with this page as `next`, no
 *                 "Register" and (even in a development build) no quick sign-in; the sign-in
 *                 and register pages show the website link instead of the forms. In local mode
 *                 both buttons and the forms stay.
 * Depends on:     @testing-library/react, ../shell/AppShell, ../shell/session, ./WebsiteSignIn
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/03-security-architecture.md §2.2
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell.js';
import { SessionProvider } from '../shell/session.js';
import { websiteSignInHref } from './WebsiteSignIn.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

const SIGN_IN = '/games/bingo/auth/website';

function serve(mode: 'local' | 'website'): void {
  const session = {
    signedIn: false,
    account: null,
    permissions: [],
    csrfToken: 'x',
    authMode: mode,
    ...(mode === 'website' ? { signInPath: SIGN_IN } : {}),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.endsWith('/session') ? session : { matches: [] })),
      ),
    ),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function renderShell(): Promise<void> {
  render(
    <SessionProvider>
      <AppShell dev />
    </SessionProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

describe('signing in in website mode (D37)', () => {
  it('offers one "Sign in" to the website with this page as next, no register, no dev menu', async () => {
    window.location.hash = '#/match/ABC123';
    serve('website');
    await renderShell();
    const signIn = await screen.findByTestId('open-sign-in');
    expect(signIn.getAttribute('href')).toBe(
      `${SIGN_IN}?next=${encodeURIComponent('/games/bingo/#/match/ABC123')}`,
    );
    expect(screen.queryByTestId('open-register')).toBeNull();
    expect(screen.queryByTestId('dev-menu')).toBeNull();
  });

  it('shows the website link instead of the register form', async () => {
    window.location.hash = '#/register';
    serve('website');
    await renderShell();
    expect((await screen.findByTestId('website-sign-in')).textContent).toContain(
      'Seasonal Entertainment account',
    );
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('keeps both buttons in local mode', async () => {
    serve('local');
    await renderShell();
    expect((await screen.findByTestId('open-sign-in')).getAttribute('href')).toBe('#/sign-in');
    expect(screen.getByTestId('open-register')).toBeTruthy();
  });

  it('returns to the lobby from a page without a hash', () => {
    expect(websiteSignInHref(SIGN_IN, '')).toBe(
      `${SIGN_IN}?next=${encodeURIComponent('/games/bingo/#/')}`,
    );
  });
});
