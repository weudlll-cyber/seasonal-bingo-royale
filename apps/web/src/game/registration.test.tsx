// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/registration.test.tsx
 * @module web/game
 * @brief  The registration status: the same words for host and players, live, "Starting…" only in the countdown.
 *
 * Responsibility: without a start time the console, the waiting room and the lobby card say
 *                 "Registration open until the host starts the match"; a set time reads
 *                 "Starts at 22:25 (in 12 min)" (with the day on another day) and who starts
 *                 it (D16), and counts down live; "start when full" says how many places are
 *                 left; "Starting…" and the countdown appear only while the real countdown runs.
 * Depends on:     @testing-library/react, ./Registration, ./Lobby, ./MatchScreen,
 *                 ../host/HostConsole, ../test/matchFixture, ./useLiveMatch
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.3
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostConsole } from '../host/HostConsole.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { Lobby } from './Lobby.js';
import { MatchScreen } from './MatchScreen.js';
import { registrationText, RegistrationStatus } from './Registration.js';
import type { MatchSummary } from './useLiveMatch.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const NOW = new Date(2026, 9, 22, 22, 13).getTime();
const AT = new Date(2026, 9, 22, 22, 25).getTime();

function withRule(rule: MatchSummary['settings']['startRule'], over: Partial<MatchSummary> = {}) {
  const base = matchSummary({ players: 3, maxPlayers: 8, ...over });
  return { ...base, settings: { ...base.settings, startRule: rule } };
}

describe('the registration status', () => {
  it('reads the same in the console, the waiting room and the lobby card', async () => {
    const text = 'Registration open until the host starts the match';
    serveMatch(matchSummary({ youHost: true }));
    await show(<HostConsole code="MATCH1" />);
    expect(screen.getByTestId('host-start-rule').textContent).toBe(text);
    cleanup();
    serveMatch(matchSummary());
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('registration').textContent).toBe(text);
    cleanup();
    serveMatch(matchSummary());
    await show(<Lobby />);
    expect(screen.getByTestId('registration-MATCH1').textContent).toBe(text);
  });

  it('gives a set time, how long until it and who starts it', () => {
    expect(registrationText(withRule({ kind: 'at', at: AT, auto: false }), NOW)).toBe(
      'Starts at 22:25 (in 12 min) · the host starts it',
    );
    expect(registrationText(withRule({ kind: 'at', at: AT, auto: true }), NOW)).toBe(
      'Starts at 22:25 (in 12 min) · starts automatically',
    );
    const tomorrow = AT + 24 * 3_600_000;
    expect(registrationText(withRule({ kind: 'at', at: tomorrow, auto: true }), NOW)).toBe(
      'Starts on Friday 23 October at 22:25 (in 1 day) · starts automatically',
    );
  });

  it('counts down live', () => {
    vi.useFakeTimers({ now: NOW });
    render(<RegistrationStatus match={withRule({ kind: 'at', at: AT, auto: false })} testId="r" />);
    expect(screen.getByTestId('r').textContent).toContain('(in 12 min)');
    act(() => {
      vi.advanceTimersByTime(11.5 * 60_000);
    });
    expect(screen.getByTestId('r').textContent).toContain('(in 30 s)');
  });

  it('says how many places are left under "start when full"', () => {
    expect(registrationText(withRule({ kind: 'whenFull' }, { players: 3 }), NOW)).toBe(
      '5 places left',
    );
    expect(registrationText(withRule({ kind: 'whenFull' }, { players: 7 }), NOW)).toBe(
      '1 place left',
    );
  });

  it('says when maintenance holds a start that is due (D22)', () => {
    const due = withRule({ kind: 'at', at: AT, auto: true }, { startHeld: true });
    expect(registrationText(due, AT + 60_000)).toBe(
      'Held by maintenance — starts when maintenance ends',
    );
  });
});

describe('the countdown (D16)', () => {
  it('shows "Starting…" only while the real countdown runs', async () => {
    const soon = Date.now() + 2 * 60_000;
    serveMatch(withRule({ kind: 'at', at: soon, auto: true }, { youHost: true }));
    await show(<HostConsole code="MATCH1" />);
    expect(screen.queryByText(/Starting/)).toBeNull();
    expect(screen.getByTestId('start-match')).toBeTruthy();
    cleanup();
    serveMatch(withRule({ kind: 'at', at: soon, auto: true }));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.queryByTestId('countdown')).toBeNull();
    expect(screen.queryByText(/Starting/)).toBeNull();
    cleanup();
    serveMatch(withRule({ kind: 'whenFull' }, { startsAt: Date.now() + 9_000 }));
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('countdown').textContent).toBe('Starting in 9 s');
    expect(screen.getByTestId('registration').textContent).toBe('Starting…');
  });
});
