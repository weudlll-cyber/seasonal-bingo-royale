// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminScreens.test.tsx
 * @module web/admin
 * @brief  "Screens and texts": the page, and the screens reading the values the server sent.
 *
 * Responsibility: `#/admin/screens` is the page; it shows a value in seconds with its limit and
 *                 saves only the changed value; with a session that sends fewer recent-event
 *                 lines the match screen shows that many; the recap plan takes the card time it
 *                 is given; the History names a screen value.
 * Depends on:     @testing-library/react, ../components/RecentEvents, ../game/interludePlan,
 *                 ../shell/router, ../shell/session, ./AdminScreens, ./changeText
 * Spec:           docs/concepts/admin-area.md §4 (Screens and texts), §8 (i), §9 piece 6
 */
import { SCREEN_DEFAULTS, clientScreensOf } from '@sbr/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentEvents } from '../components/RecentEvents.js';
import { planInterlude } from '../game/interludePlan.js';
import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { AdminScreens } from './AdminScreens.js';
import { changeLines } from './changeText.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CARD = {
  path: 'recapCardMs',
  label: 'Recap card time',
  description: 'How long each card of the recap shows at least.',
  kind: 'number',
  unit: 's',
  scale: 1000,
  min: 3000,
  max: 15000,
  value: 5000,
  default: 5000,
};

function serve(screens = clientScreensOf(SCREEN_DEFAULTS)): string[] {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(
        `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`,
      );
      const body = url.endsWith('/session')
        ? { signedIn: true, account: null, permissions: ['admin.view'], csrfToken: 'x', screens }
        : { fields: [CARD], version: 2 };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  return sent;
}

async function showIn(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('"Screens and texts" (admin-area §4)', () => {
  it('lives at #/admin/screens', () => {
    expect(parseRoute('#/admin/screens')).toEqual({ name: 'admin', section: 'screens' });
    expect(hrefOf({ name: 'admin', section: 'screens' })).toBe('#/admin/screens');
  });

  it('shows a time in seconds with its limit and saves only the change', async () => {
    const sent = serve();
    await showIn(<AdminScreens />);
    expect(screen.getByTestId('screens-recapCardMs').textContent).toContain(
      'Built in: 5 s · technical limit 3 s – 15 s',
    );
    fireEvent.change(screen.getByLabelText('Recap card time'), { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('screens-save'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sent).toContain(
      'POST /api/v1/admin/screens {"values":{"recapCardMs":7000},"comment":""}',
    );
  });

  it('names a screen value in the History', () => {
    const e = {
      id: 1,
      at: 0,
      actor: 'dev-admin',
      action: 'settings.change',
      target: 'screens@2',
      diff: { from: {}, to: { standingsRows: 30 } },
      undoable: true,
    };
    expect(changeLines(e, { screens: { standingsRows: 20 } })).toEqual(['Standings rows: 20 → 30']);
  });
});

describe('the screens read the values the server sent (§8 (i))', () => {
  it('shows as many recent-event lines as the session says', async () => {
    serve({ ...clientScreensOf(SCREEN_DEFAULTS), recentEventLines: 1 });
    const banners = ['a', 'b', 'c'].map((t) => ({ key: t, text: `line ${t}`, round: 0 }));
    await showIn(<RecentEvents banners={banners} />);
    const recent = [...screen.getByTestId('recent-events').querySelectorAll('li')];
    expect(recent.map((li) => li.textContent)).toEqual(['line c']);
  });

  it('plans the recap with the card time it is given', () => {
    const recap = { round: 1, top: [] } as unknown as Parameters<typeof planInterlude>[0];
    expect(planInterlude(recap, { kind: 'host' }, null, 8_000).cardMs).toBe(8_000);
  });
});
