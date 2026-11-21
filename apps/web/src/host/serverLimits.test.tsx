// @vitest-environment jsdom
/**
 * @file   apps/web/src/host/serverLimits.test.tsx
 * @module web/host
 * @brief  Forms take every limit from the server's session answer, never from a copy (§8 (m)).
 *
 * Responsibility: with a session whose limits differ from today's (a 40-character title, up to
 *                 150 players, a 15-second countdown, a 6 s interval, names of 4 to 20 and
 *                 passwords of 14 to 100 characters), the host form and the register form show
 *                 and check those; the round pause refuses more than its 120 s before sending.
 * Depends on:     @testing-library/react, @sbr/contracts, ./CreateMatch, ../account/Register,
 *                 ../account/accountText, ../test/matchFixture
 * Spec:           docs/concepts/admin-area.md §8 (m), §9 piece 0
 */
import { LIMITS, type ClientLimits } from '@sbr/contracts';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerProblem } from '../account/accountText.js';
import { Register } from '../account/Register.js';
import { show } from '../test/matchFixture.js';
import { CreateMatch } from './CreateMatch.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SENT: ClientLimits = {
  ...LIMITS,
  titleMaxLength: 40,
  players: { min: 2, max: 150 },
  displayName: { min: 4, max: 20 },
  password: { min: 14, max: 100 },
  startCountdownMs: 15_000,
  drawIntervalMs: 6_000,
};

function serveSession(): void {
  const answer = (url: string): unknown =>
    url.endsWith('/session')
      ? {
          signedIn: true,
          account: { id: 'h', displayName: 'dev-host' },
          permissions: ['match.join', 'match.create', 'match.manage'],
          csrfToken: 'x',
          limits: SENT,
        }
      : { matches: [], mine: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(answer(url))))),
  );
}

const input = (id: string) => screen.getByTestId<HTMLInputElement>(id);

describe('the server sends the limits; the forms keep no copy (admin-area §8 (m))', () => {
  it('the host form shows and checks the limits it was sent', async () => {
    serveSession();
    await show(<CreateMatch />);
    expect(input('create-title').maxLength).toBe(40);
    expect([input('create-max').min, input('create-max').max]).toEqual(['2', '150']);
    expect(screen.getByText('Max players (2–150)')).toBeTruthy();
    expect(input('start-draw-interval').placeholder).toBe('6');
    expect(screen.getByTestId('create-match').textContent).toContain('a 15-second countdown');
    // The round pause: at most 120 s, refused by the form before anything is sent.
    const pause = input('create-round-pause-sec');
    expect([pause.min, pause.max]).toEqual(['3', '120']);
    fireEvent.change(pause, { target: { value: '121' } });
    expect(pause.validity.rangeOverflow).toBe(true);
  });

  it('the register form names and checks the lengths it was sent', async () => {
    serveSession();
    await show(<Register />);
    const form = screen.getByTestId('register-form').textContent;
    expect(form).toContain('4 to 20 letters or digits');
    expect(form).toContain('At least 14 characters');
    const ok = { displayName: 'anna', email: 'a@b.cd', password: 'x'.repeat(14) };
    expect(registerProblem(ok, SENT)).toBeNull();
    expect(registerProblem({ ...ok, displayName: 'ann' }, SENT)).toMatch(/4 to 20/);
    expect(registerProblem({ ...ok, password: 'x'.repeat(13) }, SENT)).toBe(
      'The password needs at least 14 characters.',
    );
  });
});
