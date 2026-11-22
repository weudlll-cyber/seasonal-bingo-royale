// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminHistory.test.tsx
 * @module web/admin
 * @brief  The admin area's History and the Overview's switches (piece 2).
 *
 * Responsibility: `#/admin/history` is the History; it lists every change newest first with
 *                 who made it and what changed, old → new, and "Undo this change" on a settings
 *                 change, which posts to the undo route and reloads; the Overview shows the
 *                 switches as the server sends them and saves a change with its comment.
 * Depends on:     @testing-library/react, ../shell/router, ../shell/session, ./AdminHistory,
 *                 ./AdminOverview
 * Spec:           docs/concepts/admin-area.md §4 (Overview, History), §6, §9 piece 2
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { AdminHistory } from './AdminHistory.js';
import { AdminOverview } from './AdminOverview.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ENTRIES = [
  {
    id: 7,
    at: Date.UTC(2026, 10, 21, 20, 15),
    actor: 'dev-admin',
    action: 'settings.change',
    target: 'features@2',
    diff: {
      from: {},
      to: { guests: false, emailVerification: false },
      comment: 'No guests tonight',
    },
    undoable: true,
  },
  {
    id: 6,
    at: Date.UTC(2026, 10, 21, 19, 0),
    actor: null,
    action: 'match.abort',
    target: 'ABC123',
    diff: { reason: 'Wrong prizes' },
    undoable: false,
  },
];

// What the environment gives a document's values it leaves out (admin-area §8 (p)).
const DEFAULTS = { features: { guests: true, emailVerification: false } };

const OVERVIEW = {
  matches: [],
  maintenance: { on: false, reason: null },
  switches: { guests: true, emailVerification: false },
  health: { version: 'development', startedAt: Date.now() },
};

function serve(): string[] {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(
        `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`,
      );
      const body = url.endsWith('/session')
        ? {
            signedIn: true,
            account: null,
            permissions: ['admin.view', 'settings.edit'],
            csrfToken: 'x',
          }
        : url.includes('/admin/history')
          ? url.endsWith('/undo')
            ? { version: 3 }
            : { entries: ENTRIES, more: false, defaults: DEFAULTS }
          : url.endsWith('/admin/switches')
            ? { version: 2, switches: { guests: false, emailVerification: false } }
            : OVERVIEW;
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  return sent;
}

async function renderIn(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('the History (admin-area §4, §6)', () => {
  it('lives at #/admin/history', () => {
    expect(parseRoute('#/admin/history')).toEqual({ name: 'admin', section: 'history' });
    expect(hrefOf({ name: 'admin', section: 'history' })).toBe('#/admin/history');
    expect(parseRoute('#/admin')).toEqual({ name: 'admin' });
  });

  it('lists every change with who and what, and undoes a settings change', async () => {
    const sent = serve();
    await renderIn(<AdminHistory />);
    const first = screen.getByTestId('admin-history-7');
    expect(first.textContent).toContain('dev-admin');
    expect(first.textContent).toContain('Guests may watch: on → off');
    expect(first.textContent).toContain('No guests tonight');
    const second = screen.getByTestId('admin-history-6');
    expect(second.textContent).toContain('a removed account');
    expect(second.textContent).toContain('ABC123');
    expect(within(second).queryByRole('button', { name: 'Undo this change' })).toBeNull();
    fireEvent.click(within(first).getByRole('button', { name: 'Undo this change' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sent).toContain('POST /api/v1/admin/history/7/undo {}');
    expect(sent.filter((s) => s.startsWith('GET /api/v1/admin/history'))).toHaveLength(2);
  });
});

describe('the Overview switches (admin-area §8 (p))', () => {
  it('shows the switches and saves a change with its comment', async () => {
    const sent = serve();
    await renderIn(<AdminOverview />);
    const guests = screen.getByTestId<HTMLInputElement>('admin-switch-guests');
    expect(guests.checked).toBe(true);
    fireEvent.click(guests);
    fireEvent.change(screen.getByTestId('admin-switches-comment'), {
      target: { value: 'No guests tonight' },
    });
    fireEvent.click(screen.getByTestId('admin-switches-save'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sent).toContain(
      'POST /api/v1/admin/switches {"guests":false,"emailVerification":false,"comment":"No guests tonight"}',
    );
  });
});
