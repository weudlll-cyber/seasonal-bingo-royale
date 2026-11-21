// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminAccounts.test.tsx
 * @module web/admin
 * @brief  Players and accounts: the website note, the search, the actions and the second step.
 *
 * Responsibility: `#/admin/accounts` is the page; in website mode it only says that accounts and
 *                 roles come from the website; standalone it finds accounts by the start of a
 *                 name and shows their facts; "Make Admin" only for the owner; an action the
 *                 server answers with STEP_UP_REQUIRED runs again after "Confirm it is you".
 * Depends on:     @testing-library/react, ../shell/router, ../shell/session, ./AdminAccounts
 * Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §7, §9 piece 8
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { AdminAccounts } from './AdminAccounts.js';
import { changeLines } from './changeText.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ACCOUNT = {
  id: 'a1',
  displayName: 'managed1',
  email: 'managed@example.com',
  roles: ['player'],
  status: 'active',
  secondStep: false,
  lastLoginAt: null,
};

function serve(permissions: string[], authMode = 'local'): string[] {
  const sent: string[] = [];
  let posts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      sent.push(`${method} ${url} ${typeof init?.body === 'string' ? init.body : ''}`);
      if (url.endsWith('/session'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              signedIn: true,
              account: null,
              permissions,
              csrfToken: 'x',
              authMode,
            }),
          ),
        );
      if (url.endsWith('/step-up') || (method === 'POST' && (posts += 1) > 1))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (method === 'POST')
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'STEP_UP_REQUIRED' }), { status: 403 }),
        );
      return Promise.resolve(new Response(JSON.stringify({ accounts: [ACCOUNT] })));
    }),
  );
  return sent;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function showIn(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await settle();
}

describe('Players and accounts (admin-area §4)', () => {
  it('lives at #/admin/accounts', () => {
    expect(parseRoute('#/admin/accounts')).toEqual({ name: 'admin', section: 'accounts' });
    expect(hrefOf({ name: 'admin', section: 'accounts' })).toBe('#/admin/accounts');
  });

  it('only says that the website decides, in website mode', async () => {
    serve(['admin.view', 'accounts.manage'], 'website');
    await showIn(<AdminAccounts />);
    expect(screen.getByTestId('admin-accounts').textContent).toContain('come from the website');
    expect(screen.queryByTestId('accounts-search')).toBeNull();
  });

  it('finds accounts, offers Admin to the owner only, and runs an action after the second step', async () => {
    const sent = serve(['admin.view', 'accounts.manage']);
    await showIn(<AdminAccounts />);
    fireEvent.change(screen.getByTestId('accounts-search'), { target: { value: 'manag' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find accounts' }));
    await settle();
    const card = screen.getByTestId('account-managed1');
    expect(card.textContent).toContain('managed@example.com');
    expect(card.textContent).toContain('Player · Active · no second step · never signed in');
    expect(within(card).queryByRole('button', { name: 'Make Admin' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Lock' }));
    await settle();
    fireEvent.change(screen.getByTestId('step-up-code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await settle();
    const lock = 'POST /api/v1/admin/accounts/a1/lock {"locked":true}';
    expect(sent.filter((s) => s === lock)).toHaveLength(2);
    expect(sent).toContain('GET /api/v1/admin/accounts?q=manag ');
    expect(screen.getByRole('status').textContent).toBe('Done: locked (managed1).');
  });

  it('names each account change in the History', () => {
    const base = { id: 1, at: 0, actor: 'dev-admin', target: 'managed1', undoable: false };
    const line = (action: string, diff: Record<string, unknown> = {}) =>
      changeLines({ ...base, action, diff }, {});
    expect(line('account.role.give', { role: 'organizer' })).toEqual([
      'managed1 made an Organizer',
    ]);
    expect(line('account.role.remove', { role: 'game_admin' })).toEqual([
      'managed1 is no longer an Admin',
    ]);
    expect(line('account.lock')).toEqual(['managed1 locked']);
    expect(line('account.unlock')).toEqual(['managed1 unlocked']);
    expect(line('account.reset2fa')).toEqual(['Second step of managed1 reset']);
    expect(line('account.endSessions')).toEqual(['Sessions of managed1 ended']);
  });
});
