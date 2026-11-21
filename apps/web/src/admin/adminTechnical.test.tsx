// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminTechnical.test.tsx
 * @module web/admin
 * @brief  The Technical section: who sees it, its warning, and the second step before a change.
 *
 * Responsibility: `#/admin/technical` is the page; the admin area's navigation offers it to the
 *                 owner (`technical.edit`) and, in website mode, to website admins, never to an
 *                 Admin of a standalone install; the page warns at the top; when the server asks
 *                 for the second step again, the page asks for the code, sends it and saves the
 *                 same values again.
 * Depends on:     @testing-library/react, ../shell/router, ../shell/session, ./AdminNav,
 *                 ./AdminTechnical
 * Spec:           docs/concepts/admin-area.md §4 (Technical), §7, §8 (c), (e), §9 piece 7
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { AdminNav } from './AdminNav.js';
import { AdminTechnical } from './AdminTechnical.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LOGIN_IP = {
  path: 'loginIp',
  label: 'Sign-in tries per address',
  description: 'Sign-in tries allowed from one address in 15 minutes.',
  kind: 'number',
  unit: 'tries',
  scale: 1,
  min: 5,
  max: 500,
  value: 20,
  default: 20,
};

// The session (its permissions and mode); the Technical page asks for the step-up once.
function serve(permissions: string[], authMode = 'local'): string[] {
  const sent: string[] = [];
  let saves = 0;
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
      if (url.endsWith('/step-up')) return Promise.resolve(new Response(null, { status: 204 }));
      if (method === 'POST' && (saves += 1) === 1)
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'STEP_UP_REQUIRED' }), { status: 403 }),
        );
      return Promise.resolve(new Response(JSON.stringify({ fields: [LOGIN_IP], version: 2 })));
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

describe('the Technical section (admin-area §8 (c), (e))', () => {
  it('lives at #/admin/technical', () => {
    expect(parseRoute('#/admin/technical')).toEqual({ name: 'admin', section: 'technical' });
    expect(hrefOf({ name: 'admin', section: 'technical' })).toBe('#/admin/technical');
  });

  it('is in the navigation for the owner and website admins only', async () => {
    serve(['admin.view', 'settings.edit']);
    await showIn(<AdminNav current="overview" />);
    expect(screen.queryByRole('link', { name: 'Technical' })).toBeNull();
    cleanup();
    serve(['admin.view', 'technical.edit']);
    await showIn(<AdminNav current="overview" />);
    expect(screen.getByRole('link', { name: 'Technical' })).toBeTruthy();
    cleanup();
    serve(['admin.view', 'settings.edit'], 'website');
    await showIn(<AdminNav current="overview" />);
    expect(screen.getByRole('link', { name: 'Technical' })).toBeTruthy();
  });

  it('warns, asks for the second step again and saves the same values', async () => {
    const sent = serve(['admin.view', 'technical.edit']);
    await showIn(<AdminTechnical />);
    expect(screen.getByRole('note').textContent).toContain('A wrong value can lock players out');
    fireEvent.change(screen.getByLabelText('Sign-in tries per address'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByTestId('technical-save'));
    await settle();
    fireEvent.change(screen.getByTestId('step-up-code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and save' }));
    await settle();
    const save = 'POST /api/v1/admin/technical {"values":{"loginIp":10},"comment":""}';
    expect(sent.filter((s) => s === save)).toHaveLength(2);
    expect(sent).toContain('POST /api/v1/auth/2fa/step-up {"code":"123456"}');
    expect(screen.getByRole('status').textContent).toBe('Saved. It applies at once.');
  });
});
