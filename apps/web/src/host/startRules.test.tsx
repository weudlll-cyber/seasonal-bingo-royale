// @vitest-environment jsdom
/**
 * @file   apps/web/src/host/startRules.test.tsx
 * @module web/host
 * @brief  How a match starts on screen (01 §7.6, D16): the form, the console's switch and notice.
 *
 * Responsibility: the create form sends a set time with "Start automatically at the start
 *                 time" (off unless ticked) and refuses one less than a minute ahead; the
 *                 console of a match with a set time offers Start match and the switch,
 *                 which sends the change; it shows "Not enough players at the start time —
 *                 start it yourself or abort" when the automatic start found too few, with
 *                 the line "Waiting for players …" and "Abort match" in the lobby.
 * Depends on:     @testing-library/react, vitest, ./CreateMatch, ./createForm, ./HostConsole,
 *                 ./TimingFields, ../test/matchFixture, ../game/useLiveMatch
 * Spec:           docs/spec/01-game-design.md §7.6; docs/spec/05-api-design.md §2.3
 */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MatchSummary } from '../game/useLiveMatch.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { CreateMatch } from './CreateMatch.js';
import { createBody, INITIAL } from './createForm.js';
import { HostConsole } from './HostConsole.js';
import { startTimeProblem } from './TimingFields.js';

vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AT = Date.now() + 3_600_000;

function announced(over: Partial<MatchSummary> = {}, auto = false): MatchSummary {
  const base = matchSummary({ youHost: true, players: 3 });
  return {
    ...base,
    settings: { ...base.settings, startRule: { kind: 'at', at: AT, auto } },
    ...over,
  };
}

// The local date and time field's value an hour from now.
function localHourAhead(): string {
  const later = new Date(AT);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(later.getFullYear())}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`;
}

describe('the create form (D16)', () => {
  it('sends a set time with the automatic start off unless ticked', async () => {
    const local = localHourAhead();
    const at = new Date(local).getTime();
    const start = { kind: 'at' as const, local, auto: false };
    expect(createBody({ ...INITIAL, start }).startRule).toEqual({ kind: 'at', at, auto: false });
    expect(createBody({ ...INITIAL, start: { ...start, auto: true } }).startRule).toEqual({
      kind: 'at',
      at,
      auto: true,
    });
    expect(startTimeProblem({ kind: 'at', local: '', auto: false }, Date.now())).toBe(
      'Pick a start time at least a minute from now.',
    );
    serveMatch(matchSummary());
    await show(<CreateMatch />);
    expect(screen.queryByTestId('create-start-auto')).toBeNull();
    fireEvent.change(screen.getByTestId('create-start-rule'), { target: { value: 'at' } });
    expect(screen.getByTestId<HTMLInputElement>('create-start-auto').checked).toBe(false);
  });
});

describe('the console with a set start time (D16)', () => {
  it('offers Start match and the switch, which sends the change', async () => {
    const fetch = serveMatch(announced());
    await show(<HostConsole code="MATCH1" />);
    expect(screen.getByTestId('start-match')).toBeTruthy();
    fireEvent.click(screen.getByTestId('host-start-auto'));
    const calls = fetch.mock.calls as [string, RequestInit | undefined][];
    const sent = calls.find(([url]) => url.endsWith('/matches/MATCH1/auto-start'));
    expect(sent?.[1]?.body).toBe(JSON.stringify({ auto: true }));
    expect(screen.queryByTestId('host-too-few')).toBeNull();
  });

  it('asks the server again once the start time has passed, without waiting for a push', async () => {
    const soon = matchSummary({ youHost: true, players: 0 });
    const at = Date.now() + 300;
    const summary = {
      ...soon,
      settings: { ...soon.settings, startRule: { kind: 'at', at, auto: true } },
    };
    serveMatch(summary as MatchSummary);
    await show(<HostConsole code="MATCH1" />);
    expect(screen.queryByTestId('host-too-few')).toBeNull();
    // From now on the server answers with the notice (it decides by the clock, D16).
    Object.assign(summary, { tooFewAtStart: true });
    expect(await screen.findByTestId('host-too-few', {}, { timeout: 4_000 })).toBeTruthy();
  });

  it('says when the automatic start found too few players, and offers abort', async () => {
    const fetch = serveMatch(announced({ players: 1, tooFewAtStart: true }, true));
    await show(<HostConsole code="MATCH1" />);
    expect(screen.getByTestId('host-too-few').textContent).toBe(
      'Not enough players at the start time — start it yourself or abort.',
    );
    expect(screen.getByTestId('host-start-rule').textContent).toBe(
      'Waiting for players — at least 2 are needed to start',
    );
    expect(screen.getByTestId('start-match')).toBeTruthy();
    fireEvent.change(screen.getByTestId('abort-reason'), { target: { value: 'Nobody came' } });
    fireEvent.click(screen.getByTestId('abort-match'));
    const calls = fetch.mock.calls as [string, RequestInit | undefined][];
    const sent = calls.find(([url]) => url.endsWith('/matches/MATCH1/abort'));
    expect(sent?.[1]?.body).toBe(JSON.stringify({ reason: 'Nobody came' }));
  });
});
