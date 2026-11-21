// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/adminLeague.test.tsx
 * @module web/admin
 * @brief  The League page, a League change and a correction in the History, the profile (piece 5).
 *
 * Responsibility: `#/admin/league` is the League page; it shows each league value with its
 *                 unit, built-in value and technical limit, saves only the changed value, and
 *                 adds a correction only with a player, a delta that is not 0 and a reason,
 *                 then lists it ("+25 points — reason"); the History names a League value and
 *                 a correction; a player's profile lists the corrections with their reasons.
 * Depends on:     @testing-library/react, ../shell/router, ../shell/session, ../league/ProfilePage,
 *                 ./AdminLeague, ./changeText
 * Spec:           docs/concepts/admin-area.md §4 (League, History), §9 piece 5
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProfilePage } from '../league/ProfilePage.js';
import { hrefOf, parseRoute } from '../shell/router.js';
import { SessionProvider } from '../shell/session.js';
import { AdminLeague } from './AdminLeague.js';
import { changeLines } from './changeText.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PLACE1 = {
  path: 'place1',
  label: '1st place',
  description: 'League points for this place in a match that counts.',
  kind: 'number',
  unit: 'points',
  scale: 1,
  min: 0,
  max: 1000,
  value: 100,
  default: 100,
};
const CORRECTION = { id: 3, player: 'dev-player-1', delta: 25, reason: 'Broken match', at: 0 };

function serve(): string[] {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      sent.push(
        `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`,
      );
      const body = url.endsWith('/session')
        ? { signedIn: true, account: null, permissions: ['admin.view'], csrfToken: 'x' }
        : url.includes('/players/')
          ? { ...PROFILE }
          : { fields: [PLACE1], corrections: [CORRECTION], version: 2, id: 4 };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  return sent;
}

const PROFILE = {
  displayName: 'dev-player-1',
  matchesPlayed: 0,
  wins: 0,
  bestPlacement: null,
  seasonCompletes: 0,
  badges: [],
  recentMatches: [],
  corrections: [{ delta: -20, reason: 'Played two accounts', at: '2026-11-21T08:00:00.000Z' }],
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function showIn(ui: React.ReactElement): Promise<void> {
  render(<SessionProvider>{ui}</SessionProvider>);
  await settle();
}

describe('the League page (admin-area §4)', () => {
  it('lives at #/admin/league', () => {
    expect(parseRoute('#/admin/league')).toEqual({ name: 'admin', section: 'league' });
    expect(hrefOf({ name: 'admin', section: 'league' })).toBe('#/admin/league');
  });

  it('shows a value with its limit and saves only the change', async () => {
    const sent = serve();
    await showIn(<AdminLeague />);
    expect(screen.getByTestId('league-place1').textContent).toContain(
      'Built in: 100 points · technical limit 0 points – 1000 points',
    );
    fireEvent.change(screen.getByLabelText('1st place'), { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('league-save'));
    await settle();
    expect(sent).toContain('POST /api/v1/admin/league {"values":{"place1":150},"comment":""}');
  });

  it('adds a correction only with a player, a delta and a reason, and lists it', async () => {
    const sent = serve();
    await showIn(<AdminLeague />);
    expect(screen.getByTestId('correction-3').textContent).toContain('+25 points — Broken match');
    const add = screen.getByTestId<HTMLButtonElement>('correction-add');
    fireEvent.change(screen.getByTestId('correction-player'), {
      target: { value: 'dev-player-1' },
    });
    fireEvent.change(screen.getByTestId('correction-delta'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('correction-reason'), {
      target: { value: 'Broken match' },
    });
    expect(add.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('correction-delta'), { target: { value: '-20' } });
    expect(add.disabled).toBe(false);
    fireEvent.click(add);
    await settle();
    expect(sent).toContain(
      'POST /api/v1/admin/league/corrections {"displayName":"dev-player-1","delta":-20,"reason":"Broken match"}',
    );
  });
});

describe('the League in the History and on the profile (admin-area §4, §6)', () => {
  it('names a League value and a correction', () => {
    const base = { id: 1, at: 0, actor: 'dev-admin', undoable: true };
    const change = {
      ...base,
      action: 'settings.change',
      target: 'leaderboard@2',
      diff: { from: {}, to: { place1: 150 } },
    };
    expect(changeLines(change, { leaderboard: { place1: 100 } })).toEqual(['1st place: 100 → 150']);
    const correction = {
      ...base,
      action: 'league.correct',
      target: 'dev-player-1',
      diff: { delta: -20, reason: 'Two accounts' },
    };
    expect(changeLines(correction, {})).toEqual([
      'League points of dev-player-1: −20 points (Two accounts)',
    ]);
  });

  it('lists the corrections on the player’s profile', async () => {
    serve();
    await showIn(<ProfilePage displayName="dev-player-1" />);
    expect(screen.getByTestId('profile-corrections').textContent).toContain(
      '−20 points — Played two accounts',
    );
  });
});
