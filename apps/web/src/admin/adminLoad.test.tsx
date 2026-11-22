// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminLoad.test.tsx
 * @module web/admin
 * @brief  A late answer of an abandoned load does not reset what the admin is typing.
 *
 * Responsibility: React's StrictMode (development) mounts a page twice, so the League,
 *                 Screens and Technical pages each send their GET twice. When the first
 *                 answer comes last (a slow server: CI run 45043180902, Firefox), it must not
 *                 count as a new version: the form would remount with the server's values and
 *                 drop the admin's typing, and the save button would turn disabled.
 * Depends on:     @testing-library/react, ../shell/session, ./AdminLeague, ./AdminScreens,
 *                 ./AdminTechnical
 * Spec:           docs/concepts/admin-area.md §4
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '../shell/session.js';
import { AdminLeague } from './AdminLeague.js';
import { AdminScreens } from './AdminScreens.js';
import { AdminTechnical } from './AdminTechnical.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FIELD = {
  path: 'place1',
  label: 'The value',
  description: 'A value of the page.',
  kind: 'number',
  unit: 'points',
  scale: 1,
  min: 0,
  max: 1000,
  value: 100,
  default: 100,
};
const SESSION = {
  signedIn: true,
  account: null,
  permissions: ['admin.view', 'settings.edit', 'league.correct', 'technical.edit'],
  csrfToken: 'x',
};

// The page's GETs wait until the test answers them, in the order it chooses.
function serveHeld(page: string): (() => void)[] {
  const held: (() => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.endsWith('/session')) return Promise.resolve(new Response(JSON.stringify(SESSION)));
      if (!url.endsWith(page)) return Promise.resolve(new Response(JSON.stringify({})));
      const body = JSON.stringify({ fields: [FIELD], corrections: [] });
      return new Promise<Response>((resolve) => {
        held.push(() => {
          resolve(new Response(body));
        });
      });
    }),
  );
  return held;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const PAGES: [string, string, () => ReactElement][] = [
  ['League', '/admin/league', () => <AdminLeague />],
  ['Screens and texts', '/admin/screens', () => <AdminScreens />],
  ['Technical', '/admin/technical', () => <AdminTechnical />],
];

describe('an admin page loaded twice by StrictMode', () => {
  it.each(PAGES)('%s keeps the typing when the first answer comes last', async (_n, path, page) => {
    const held = serveHeld(path);
    render(
      <StrictMode>
        <SessionProvider>{page()}</SessionProvider>
      </StrictMode>,
    );
    await settle();
    expect(held.length).toBe(2);
    held[1]?.();
    await settle();
    fireEvent.change(screen.getByLabelText('The value'), { target: { value: '150' } });
    held[0]?.();
    await settle();
    expect(screen.getByLabelText<HTMLInputElement>('The value').value).toBe('150');
  });
});
