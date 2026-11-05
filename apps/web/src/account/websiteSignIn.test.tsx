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

// A server in that mode for a visitor without a session; the requests the client sent.
function serve(mode: 'local' | 'website'): string[] {
  const session = {
    signedIn: false,
    kind: null,
    account: null,
    permissions: [],
    csrfToken: 'x',
    features: { guests: true },
    authMode: mode,
    ...(mode === 'website' ? { signInPath: SIGN_IN } : {}),
  };
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.resolve(
        new Response(JSON.stringify(url.endsWith('/session') ? session : { matches: [] })),
      );
    }),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return sent;
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
      `${SIGN_IN}/login?next=${encodeURIComponent('/games/bingo/#/match/ABC123')}`,
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

  it('watches as a guest in website mode: one guest session for a visitor without one', async () => {
    const sent = serve('website');
    await renderShell();
    await screen.findByTestId('open-sign-in');
    expect(sent.filter((r) => r.startsWith('POST') && r.endsWith('/auth/guest'))).toHaveLength(1);
  });

  it('asks for no guest session in local mode', async () => {
    const sent = serve('local');
    await renderShell();
    await screen.findByTestId('open-register');
    expect(sent.filter((r) => r.endsWith('/auth/guest'))).toEqual([]);
  });

  it('keeps both buttons in local mode', async () => {
    serve('local');
    await renderShell();
    expect((await screen.findByTestId('open-sign-in')).getAttribute('href')).toBe('#/sign-in');
    expect(screen.getByTestId('open-register')).toBeTruthy();
  });

  it('goes to the website login with this page, or the lobby from a page without a hash', () => {
    expect(websiteSignInHref(SIGN_IN, '')).toBe(
      `${SIGN_IN}/login?next=${encodeURIComponent('/games/bingo/#/')}`,
    );
    expect(websiteSignInHref(SIGN_IN, '#/match/ABC123')).toBe(
      `${SIGN_IN}/login?next=${encodeURIComponent('/games/bingo/#/match/ABC123')}`,
    );
  });
});
