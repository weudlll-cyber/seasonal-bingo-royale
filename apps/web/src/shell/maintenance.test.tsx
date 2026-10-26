// @vitest-environment jsdom
/**
 * @file   apps/web/src/shell/maintenance.test.tsx
 * @module web/shell
 * @brief  The client during `sbr maintenance on`: the page, the host's banner, running matches.
 *
 * Responsibility: with maintenance on, the lobby and the create form show "Maintenance —
 *                 we'll be back shortly" with the operator's reason; the host console stays
 *                 reachable with a banner above it; a match screen is not replaced (running
 *                 matches play to the end); with maintenance off the lobby shows as usual.
 * Depends on:     @testing-library/react, vitest, ./AppShell, ./session
 * Spec:           docs/spec/09-deployment-architecture.md §4; docs/spec/01-game-design.md §13
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell.js';
import { SessionProvider } from './session.js';

vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function serve(maintenance: { on: boolean; reason: string | null }): void {
  const answer = (url: string): unknown => {
    if (url.endsWith('/maintenance')) return maintenance;
    if (url.endsWith('/session')) {
      return { signedIn: false, account: null, permissions: [], csrfToken: 'x' };
    }
    return { matches: [] };
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(answer(url))))),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function shell(hash: string): Promise<void> {
  window.location.hash = hash;
  render(
    <SessionProvider>
      <AppShell dev={false} />
    </SessionProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('maintenance (09 §4)', () => {
  it('shows the maintenance page with the reason instead of the lobby and the create form', async () => {
    serve({ on: true, reason: 'Database upgrade, back at 22:00' });
    await shell('#/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      "Maintenance — we'll be back shortly",
    );
    expect(screen.getByTestId('maintenance-reason').textContent).toBe(
      'Database upgrade, back at 22:00',
    );
    cleanup();
    await shell('#/host/new');
    expect(screen.getByTestId('maintenance-page')).toBeTruthy();
  });

  it('keeps the host console with a banner and leaves a match screen alone', async () => {
    serve({ on: true, reason: null });
    await shell('#/host/ABC123');
    expect(screen.getByTestId('maintenance-banner').textContent).toContain(
      'this match plays to the end',
    );
    expect(screen.queryByTestId('maintenance-page')).toBeNull();
    cleanup();
    await shell('#/match/ABC123');
    expect(screen.queryByTestId('maintenance-page')).toBeNull();
    expect(screen.queryByTestId('maintenance-banner')).toBeNull();
  });

  it('shows the lobby when maintenance is off', async () => {
    serve({ on: false, reason: null });
    await shell('#/');
    expect(screen.queryByTestId('maintenance-page')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Lobby');
  });
});
