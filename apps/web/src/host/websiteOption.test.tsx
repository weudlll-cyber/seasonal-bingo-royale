// @vitest-environment jsdom
/**
 * @file   apps/web/src/host/websiteOption.test.tsx
 * @module web/host
 * @brief  "Show on the Seasonal Entertainment website": website mode only, off by default (D50).
 *
 * Responsibility: the create body carries `showOnWebsite` only when the box is ticked; the host
 *                 console of an open lobby shows the switch in website mode and sends the change,
 *                 and shows none in a standalone install.
 * Depends on:     @testing-library/react, ./createForm, ./HostConsole, ../test/matchFixture
 * Spec:           docs/OPEN-ROUNDS.md; docs/spec/07-integration-architecture.md §7
 */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { createBody } from './createForm.js';
import { HostConsole } from './HostConsole.js';

vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const form = (website: boolean) =>
  createBody({
    title: 't',
    gameType: 'royale',
    pace: { kind: 'realtime' },
    prizes: new Set(),
    draw: { mode: 'host', intervalSec: null, skipped: false },
    missed: { mode: 'manual', missed: 'noAutoMark', delaySec: 3 },
    leaderboard: null,
    website,
    maxPlayers: 20,
    pause: { kind: 'host' },
    start: { kind: 'host' },
  });

// The host's console of an open lobby, the session in that mode; the requests sent.
async function console(mode: 'local' | 'website'): Promise<string[]> {
  const answers = serveMatch(matchSummary({ youHost: true })) as unknown as (
    url: string,
    init?: RequestInit,
  ) => Promise<Response>;
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      sent.push(`${init?.method ?? 'GET'} ${url} ${body}`);
      const r = await answers(url, init);
      if (!url.endsWith('/session')) return r;
      const session = (await r.json()) as object;
      return new Response(JSON.stringify({ ...session, authMode: mode }));
    }),
  );
  await show(<HostConsole code="MATCH1" />);
  return sent;
}

describe('"Show on the Seasonal Entertainment website" (D50)', () => {
  it('goes with a new match only when ticked', () => {
    expect(form(true).showOnWebsite).toBe(true);
    expect('showOnWebsite' in form(false)).toBe(false);
  });

  it('is a switch in the host console in website mode, and sends the change', async () => {
    const sent = await console('website');
    fireEvent.click(screen.getByTestId('host-website'));
    expect(
      sent.some((r) => r.includes('/matches/MATCH1/website') && r.includes('"show":true')),
    ).toBe(true);
  });

  it('does not exist in a standalone install', async () => {
    await console('local');
    expect(screen.queryByTestId('host-website')).toBeNull();
  });
});
