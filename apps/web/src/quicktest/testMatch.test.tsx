// @vitest-environment jsdom
/**
 * @file   apps/web/src/quicktest/testMatch.test.tsx
 * @module web/quicktest
 * @brief  The test page's real test match: request body, call order, sign-in, maintenance, guide.
 *
 * Responsibility: "In 1 minute" sends a set time a minute ahead with the automatic start and
 *                 "Now" the host's start; the bots field's limits follow "I play along"; the
 *                 calls run create → join → bots (→ start for "Now"); signed out the section
 *                 offers the dev host sign-in instead of the form; maintenance disables the
 *                 button with the reason; the form shows the numbered steps; Create opens a
 *                 tab in the click itself, sends it to the host console and this tab to the
 *                 match's normal player route once the bots are in; a blocked tab or a failed
 *                 later step stays here with the code, the console link and the waiting room.
 * Depends on:     @testing-library/react, ./testMatchSetup, ./TestMatch, ../shell/session,
 *                 ../shell/useMaintenance
 * Spec:           docs/spec/01-game-design.md §7.6 (D16, D22); docs/spec/05-api-design.md §2.3
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '../shell/session.js';
import { MaintenanceContext, type MaintenanceState } from '../shell/useMaintenance.js';
import { botLimits, createTestMatch, INITIAL_TEST_MATCH, testMatchBody } from './testMatchSetup.js';
import { TestMatchSection } from './TestMatch.js';

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

// window.open as the browser answers it: a tab whose address the page sets, or null (blocked).
function stubOpen(blocked = false): {
  readonly open: ReturnType<typeof vi.fn>;
  readonly tab: { location: { href: string }; close: ReturnType<typeof vi.fn> };
} {
  const tab = { location: { href: '' }, close: vi.fn() };
  const open = vi.fn(() => (blocked ? null : tab));
  vi.stubGlobal('open', open);
  return { open, tab };
}

const HOST = ['match.join', 'match.create', 'match.manage'];

// Answers the session (with the given permissions) and every POST with a match code.
function serve(permissions: readonly string[]): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const body = url.endsWith('/session')
      ? {
          signedIn: true,
          account: { id: 'h', displayName: 'dev-host' },
          permissions,
          csrfToken: 'x',
        }
      : init?.method === 'POST'
        ? { code: 'TEST01' }
        : { matches: [] };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function posts(fetch: ReturnType<typeof vi.fn>): string[] {
  const calls = fetch.mock.calls as [string, RequestInit | undefined][];
  return calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => `${url.replace(/^.*\/api\/v1/, '')} ${init?.body as string}`);
}

async function showSection(maintenance: MaintenanceState | null = null): Promise<void> {
  render(
    <SessionProvider>
      <MaintenanceContext.Provider value={maintenance}>
        <TestMatchSection />
      </MaintenanceContext.Provider>
    </SessionProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('the test match request', () => {
  it('starts in one minute by itself, or now through the host', () => {
    const now = 1_000_000;
    const inOne = testMatchBody(INITIAL_TEST_MATCH, now);
    expect(inOne.startRule).toEqual({ kind: 'at', at: now + 62_000, auto: true });
    expect(inOne).toMatchObject({ gameType: 'royale', drawMode: 'auto', maxPlayers: 11 });
    const inFive = testMatchBody({ ...INITIAL_TEST_MATCH, start: { kind: 'in', minutes: 5 } }, now);
    expect(inFive.startRule).toEqual({ kind: 'at', at: now + 302_000, auto: true });
    const rightNow = testMatchBody({ ...INITIAL_TEST_MATCH, start: { kind: 'now' } }, now);
    expect(rightNow.startRule).toEqual({ kind: 'host' });
  });

  it('keeps the bots inside the largest match, with or without the owner', () => {
    expect(botLimits(true)).toEqual({ min: 1, max: 199 });
    expect(botLimits(false)).toEqual({ min: 2, max: 200 });
    const many = testMatchBody({ ...INITIAL_TEST_MATCH, bots: 500 }, 0);
    expect(many.maxPlayers).toBe(200);
  });

  it('creates, joins the owner, fills bots and starts "Now" in this order', async () => {
    const fetch = serve(HOST);
    const created = vi.fn();
    await createTestMatch({ ...INITIAL_TEST_MATCH, start: { kind: 'now' } }, created);
    const sent = posts(fetch);
    expect(sent[0]).toMatch(/^\/matches \{/);
    expect(sent.slice(1)).toEqual([
      '/matches/TEST01/join {}',
      '/matches/TEST01/bots {"upTo":8}',
      '/matches/TEST01/start {}',
    ]);
    expect(created).toHaveBeenCalledWith('TEST01');
  });

  it('neither joins nor starts when the owner watches and the match starts later', async () => {
    const fetch = serve(HOST);
    await createTestMatch({ ...INITIAL_TEST_MATCH, playAlong: false }, vi.fn());
    expect(posts(fetch).slice(1)).toEqual(['/matches/TEST01/bots {"upTo":7}']);
  });
});

// Every POST answers a code, except the bots: held until `release`, or refused.
function serveSlowBots(refuse: boolean): () => void {
  let release = (): void => undefined;
  const bots = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/session')) {
        const session = { signedIn: true, account: null, permissions: HOST, csrfToken: 'x' };
        return new Response(JSON.stringify(session));
      }
      if (url.endsWith('/bots')) {
        await bots;
        if (refuse) return new Response(JSON.stringify({ code: 'MATCH_FULL' }), { status: 409 });
      }
      return new Response(JSON.stringify(init?.method === 'POST' ? { code: 'TEST01' } : {}));
    }),
  );
  return release;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('section A while it sets the match up', () => {
  it('opens the console tab in the click and goes to the waiting room once the bots are in', async () => {
    const { open, tab } = stubOpen();
    const release = serveSlowBots(false);
    await showSection({ on: false, reason: null });
    fireEvent.click(screen.getByTestId('test-match-create'));
    // In the click itself, so the browser does not block it.
    expect(open).toHaveBeenCalledTimes(1);
    await settle();
    expect(window.location.hash).not.toBe('#/match/TEST01');
    release();
    await settle();
    expect(tab.location.href).toMatch(/#\/host\/TEST01$/);
    expect(window.location.hash).toBe('#/match/TEST01');
  });

  it('stays with the code, the console and the waiting room when the tab is blocked', async () => {
    stubOpen(true);
    serve(HOST);
    await showSection({ on: false, reason: null });
    fireEvent.click(screen.getByTestId('test-match-create'));
    await settle();
    expect(window.location.hash).not.toBe('#/match/TEST01');
    expect(screen.getByTestId('test-match-code').textContent).toBe('TEST01');
    const console = screen.getByTestId('test-match-console');
    expect(console.getAttribute('href')).toBe('#/host/TEST01');
    expect(console.getAttribute('target')).toBe('_blank');
    expect(screen.getByTestId('test-match-go').getAttribute('href')).toBe('#/match/TEST01');
  });

  it('still shows the code with the message when a step after creating fails', async () => {
    stubOpen();
    const release = serveSlowBots(true);
    await showSection({ on: false, reason: null });
    fireEvent.click(screen.getByTestId('test-match-create'));
    release();
    await settle();
    expect(window.location.hash).not.toBe('#/match/TEST01');
    expect(screen.getByTestId('test-match-code').textContent).toBe('TEST01');
    expect(screen.getByTestId('test-match-error').textContent).toContain('Could not set up');
  });
});

describe('section A on the page', () => {
  it('offers the dev host sign-in instead of the form when signed out', async () => {
    serve([]);
    await showSection();
    expect(screen.getByTestId('test-match-sign-in-host')).toBeTruthy();
    expect(screen.queryByTestId('test-match-form')).toBeNull();
  });

  it('disables Create test match during maintenance and says why', async () => {
    serve(HOST);
    await showSection({ on: true, reason: 'Back at 18:00.' });
    expect(screen.getByTestId<HTMLButtonElement>('test-match-create').disabled).toBe(true);
    expect(screen.getByTestId('test-match-maintenance').textContent).toBe(
      'Maintenance is on — matches cannot start now. Back at 18:00.',
    );
  });

  it('shows the numbered steps under the form', async () => {
    serve(HOST);
    await showSection({ on: false, reason: null });
    expect(screen.getByTestId('test-match-bots').getAttribute('max')).toBe('199');
    const steps = screen.getByTestId('test-match-steps');
    expect(steps.textContent).toContain('What happens next');
    expect(steps.querySelectorAll('li').length).toBe(6);
  });
});
