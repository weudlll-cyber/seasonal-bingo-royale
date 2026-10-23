// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/shell.test.tsx
 * @module web/shell
 * @brief  The app shell: routes, the dev-only quick sign-in, the host link by permission.
 *
 * Responsibility: hashes map to the lobby, match, host and Quick Test screens and back;
 *                 the quick sign-in buttons "Sign in as host" / "Sign in as player 1/2/3"
 *                 exist only in development (production passes dev=false); "Host a match"
 *                 shows only with `match.create`; the Quick Test link only in development.
 * Depends on:     @testing-library/react, ./AppShell, ./router, ./session
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/01-game-design.md §13
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { hrefOf, parseRoute } from './router.js';
import { SessionProvider } from './session.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function serve(permissions: readonly string[]): void {
  const session = {
    signedIn: permissions.length > 0,
    account: permissions.length > 0 ? { id: 'a', displayName: 'dev-host' } : null,
    permissions,
    csrfToken: 'x',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.endsWith('/session') ? session : { matches: [] })),
      ),
    ),
  );
  // jsdom has no matchMedia; the bar's theme toggle asks it for the system setting.
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function renderShell(dev: boolean): Promise<void> {
  render(
    <SessionProvider>
      <AppShell dev={dev} />
    </SessionProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
}

describe('routes', () => {
  it('maps hashes to screens and back', () => {
    expect(parseRoute('#/')).toEqual({ name: 'lobby' });
    expect(parseRoute('#/match/ABC123')).toEqual({ name: 'match', code: 'ABC123' });
    expect(parseRoute('#/host/new')).toEqual({ name: 'hostNew' });
    expect(parseRoute('#/host/ABC123')).toEqual({ name: 'host', code: 'ABC123' });
    expect(parseRoute('#/quicktest')).toEqual({ name: 'quicktest' });
    expect(hrefOf({ name: 'match', code: 'X' })).toBe('#/match/X');
  });
});

describe('app shell', () => {
  it('offers the quick sign-in only in development', async () => {
    serve([]);
    await renderShell(true);
    // One compact menu in the bar; its items appear when it opens.
    expect(screen.queryByTestId('dev-sign-in-host')).toBeNull();
    // The development tools load on demand (lazy import, left out of production bundles).
    fireEvent.click(await screen.findByTestId('dev-menu'));
    expect(screen.getByTestId('dev-sign-in-host').textContent).toBe('Sign in as host');
    expect(screen.getByText(/One window holds one sign-in/)).toBeTruthy();
    expect(screen.getByTestId('dev-sign-in-player-3').textContent).toBe('Sign in as player 3');
    expect(await screen.findByText('Quick Test')).toBeTruthy();
    cleanup();
    await renderShell(false);
    expect(screen.queryByTestId('dev-menu')).toBeNull();
    expect(screen.queryByText('Quick Test')).toBeNull();
    // Its address opens the lobby in a production build (its server route is dev-only).
    cleanup();
    window.location.hash = '#/quicktest';
    await renderShell(false);
    expect(screen.queryByTestId('start-run')).toBeNull();
    window.location.hash = '';
  });

  it('shows "Host a match" and the host role only with match.create', async () => {
    serve(['match.watch', 'match.join', 'match.create', 'match.manage']);
    await renderShell(false);
    expect(await screen.findByText('Host a match')).toBeTruthy();
    expect(screen.getByTestId('signed-in-as').textContent).toBe('Signed in as dev-host (host)');
    cleanup();
    serve(['match.watch', 'match.join']);
    await renderShell(false);
    expect(screen.queryByText('Host a match')).toBeNull();
    expect(screen.getByTestId('signed-in-as').textContent).toBe('Signed in as dev-host (player)');
  });
});

describe('the session after a quick sign-in', () => {
  it('keeps the sign-in when the first session answer arrives after it', async () => {
    const anonymous = { signedIn: false, account: null, permissions: [], csrfToken: 'x' };
    const host = {
      signedIn: true,
      account: { id: 'a', displayName: 'dev-host' },
      permissions: ['match.create'],
      csrfToken: 'y',
    };
    // The first GET /session (sent on load, before the sign-in) answers last.
    let answerFirst: (r: Response) => void = () => undefined;
    let sessionCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (!url.endsWith('/session')) return Promise.resolve(new Response('{}'));
        sessionCalls += 1;
        if (sessionCalls === 1) return new Promise<Response>((r) => (answerFirst = r));
        return Promise.resolve(new Response(JSON.stringify(host)));
      }),
    );
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await renderShell(true);
    fireEvent.click(await screen.findByTestId('dev-menu'));
    fireEvent.click(screen.getByTestId('dev-sign-in-host'));
    expect(await screen.findByTestId('signed-in-as')).toBeTruthy();
    await act(async () => {
      answerFirst(new Response(JSON.stringify(anonymous)));
      await Promise.resolve();
    });
    expect(screen.getByTestId('signed-in-as').textContent).toBe('Signed in as dev-host (host)');
  });
});
