// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminOverview.test.tsx
 * @module web/admin
 * @brief  The Admin menu item and the Overview: open matches with Abort, maintenance, health.
 *
 * Responsibility: the "Admin" item is in the navigation only for a session that may see the
 *                 Overview (`admin.view`); the Overview lists every open match with its host and
 *                 an Abort that needs a reason and posts to the admin route; maintenance shows
 *                 its state and switches with the reason; the health line names the version.
 * Depends on:     @testing-library/react, ../shell/AppShell, ../shell/session, ./AdminOverview
 * Spec:           docs/concepts/admin-area.md §2, §4 (Overview), §9 piece 1
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../shell/AppShell.js';
import { SessionProvider } from '../shell/session.js';
import { AdminOverview } from './AdminOverview.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = '';
});

const OVERVIEW = {
  matches: [
    {
      code: 'ABC123',
      title: 'Friday royale',
      gameType: 'royale',
      mode: 'realtime',
      status: 'running',
      players: 12,
      maxPlayers: 20,
      host: 'dev-host',
      createdAt: 0,
      startsAt: null,
    },
  ],
  maintenance: { on: false, reason: null },
  switches: { guests: true, emailVerification: false },
  health: { version: 'main (abc123def456)', startedAt: Date.now() - 3 * 3_600_000 },
};

describe('the Overview without an answer', () => {
  it('keeps loading when the server does not answer, and refuses nobody', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('network down'))),
    );
    render(
      <SessionProvider>
        <AdminOverview />
      </SessionProvider>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId('admin-refused')).toBeNull();
    expect(screen.getByText('Loading the Overview…')).toBeTruthy();
  });
});

// The session with `permissions`; the Overview's answer; every request recorded.
function serve(permissions: readonly string[]): string[] {
  const sent: string[] = [];
  const session = {
    signedIn: true,
    account: { id: 'a', displayName: 'dev-admin' },
    permissions,
    csrfToken: 'x',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(
        `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`,
      );
      const body = url.endsWith('/session')
        ? session
        : url.endsWith('/admin/overview')
          ? OVERVIEW
          : url.endsWith('/admin/maintenance')
            ? { on: true, reason: 'Update tonight' }
            : { matches: [] };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  return sent;
}

async function renderIn(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('the Admin menu item (admin-area §8 (a))', () => {
  it('is there for an admin and not for an organizer', async () => {
    serve(['match.create', 'match.manage', 'match.abort', 'admin.view']);
    await renderIn(<AppShell dev={false} />);
    expect(screen.getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('#/admin');
    cleanup();
    serve(['match.create', 'match.manage']);
    await renderIn(<AppShell dev={false} />);
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });
});

describe('the Overview (admin-area §4)', () => {
  it('lists every open match with its host and aborts one with a reason', async () => {
    const sent = serve(['admin.view', 'match.abort', 'maintenance.manage']);
    await renderIn(<AdminOverview />);
    const row = screen.getByTestId('admin-match-ABC123');
    expect(row.textContent).toContain('Friday royale');
    expect(row.textContent).toContain('dev-host');
    expect(row.textContent).toContain('12 / 20 players');
    const reason = within(row).getByTestId<HTMLInputElement>('abort-reason');
    expect(reason.required).toBe(true);
    fireEvent.change(reason, { target: { value: 'Wrong settings' } });
    fireEvent.submit(reason);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sent).toContain('POST /api/v1/admin/matches/ABC123/abort {"reason":"Wrong settings"}');
  });

  it('switches maintenance with its reason and names the version', async () => {
    const sent = serve(['admin.view', 'match.abort', 'maintenance.manage']);
    await renderIn(<AdminOverview />);
    expect(screen.getByTestId('admin-health').textContent).toContain('main (abc123def456)');
    expect(screen.getByTestId('admin-maintenance-state').textContent).toBe('Maintenance is off');
    fireEvent.change(screen.getByTestId('admin-maintenance-reason'), {
      target: { value: 'Update tonight' },
    });
    fireEvent.click(screen.getByTestId('admin-maintenance-toggle'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sent).toContain('POST /api/v1/admin/maintenance {"on":true,"reason":"Update tonight"}');
    expect(screen.getByTestId('admin-maintenance-state').textContent).toBe(
      'Maintenance is on: Update tonight',
    );
  });
});
