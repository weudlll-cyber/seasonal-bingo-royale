// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/asyncMatch.test.tsx
 * @module web/game
 * @brief  Asynchronous matches on screen: the create form, the rules line, quiet hours, "While you were away".
 *
 * Responsibility: the create form offers the asynchronous pace for the royale only and sends
 *                 the mode, the minutes, the quiet hours and the browser's time zone (a
 *                 realtime match sends none of them); the rules line says "every 15 minutes"
 *                 and the quiet hours; a player's screen shows the quiet-hours notice and the
 *                 server's away summary on top, which Dismiss removes, no speed window or bar
 *                 and "In progress"; the console takes minutes and, in development, has "Jump
 *                 ahead"; the first answer is shown also when strict mode ran the fetch twice.
 * Depends on:     @testing-library/react, react, ../host/CreateMatch, ../host/createForm,
 *                 ../host/HostConsole, ./labels,
 *                 ./AwaySummary,
 *                 ./MatchScreen, ../test/matchFixture, ../test/quickTestFixture, ./useLiveMatch
 * Spec:           docs/spec/01-game-design.md §5, §11; docs/spec/06-realtime-architecture.md §6
 */
import type { AwaySummary as Summary } from '@sbr/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateMatch } from '../host/CreateMatch.js';
import { HostConsole } from '../host/HostConsole.js';
import { createBody, INITIAL } from '../host/createForm.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { royaleFixture } from '../test/quickTestFixture.js';
import { AwaySummary, awayLines } from './AwaySummary.js';
import { rulesLine } from './labels.js';
import { MatchScreen } from './MatchScreen.js';
import type { MatchSummary } from './useLiveMatch.js';

vi.mock('./socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: () => Promise.resolve({ ok: true }),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const slow: MatchSummary = matchSummary({
  code: 'SLOW01',
  status: 'running',
  mode: 'async',
  settings: {
    ...matchSummary().settings,
    markingMode: 'auto',
    drawMode: 'auto',
    drawIntervalMs: 15 * 60_000,
    quietHours: { startHour: 0, endHour: 7 },
    timeZone: 'Europe/Berlin',
  },
});

const away: Summary = {
  fromSeq: 40,
  toSeq: 260,
  draws: 61,
  marks: 14,
  patterns: 2,
  seasons: ['spring', 'winter'],
  seasonComplete: false,
  pointsBefore: 120,
  pointsNow: 410,
  rankBefore: 5,
  rankNow: 2,
  playersIn: 4,
  cutsSurvived: 1,
  eliminated: false,
  finished: false,
  finalPlace: null,
};

describe('creating an asynchronous match', () => {
  it('sends the mode, minutes, quiet hours and time zone; a realtime match none of them', () => {
    const body = createBody({
      ...INITIAL,
      pace: { kind: 'async', minutes: 30, quiet: { startHour: 23, endHour: 6 } },
    });
    expect(body).toMatchObject({
      mode: 'async',
      drawIntervalMs: 30 * 60_000,
      quietHours: { startHour: 23, endHour: 6 },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const live = createBody(INITIAL);
    expect('mode' in live || 'quietHours' in live || 'timeZone' in live).toBe(false);
  });

  it('offers the asynchronous pace for the royale only', async () => {
    serveMatch(matchSummary());
    await show(<CreateMatch />);
    fireEvent.change(screen.getByTestId('create-pace'), { target: { value: 'async' } });
    expect(screen.getByTestId('create-async-minutes')).toBeTruthy();
    expect(screen.getByTestId('create-quiet')).toBeTruthy();
    expect(screen.queryByTestId('missed-numbers')).toBeNull();
    fireEvent.change(screen.getByTestId('create-game-type'), { target: { value: 'classic' } });
    expect(screen.queryByTestId('create-pace')).toBeNull();
    expect(screen.queryByTestId('create-async-minutes')).toBeNull();
  });
});

describe('an asynchronous match on screen', () => {
  it('names the cadence and the quiet hours in the rules line', () => {
    expect(rulesLine(slow)).toBe(
      'Draws: timed (every 15 minutes) · Marking: automatic · Quiet hours 00:00–07:00 (Europe/Berlin)',
    );
  });

  it('shows the quiet-hours notice and the away summary, which Dismiss removes', async () => {
    const until = new Date('2026-06-11T05:00:00Z').getTime();
    // A match in its first round (the whole fixture would be finished).
    const running = royaleFixture();
    serveMatch(
      { ...slow, quietUntil: until },
      { ...running, events: running.events.slice(0, 11) },
      away,
    );
    await show(<MatchScreen code="SLOW01" />);
    expect(screen.getByTestId('quiet-hours').textContent).toContain('Quiet hours');
    const panel = screen.getByTestId('away-summary');
    expect(panel.textContent).toContain('While you were away');
    expect(panel.textContent).toContain('61 numbers drawn');
    expect(panel.textContent).toContain('14 marked on your card');
    expect(panel.textContent).toContain('Rank 5 → 2');
    expect(panel.textContent).toContain('You survived 1 cut.');
    fireEvent.click(screen.getByTestId('away-dismiss'));
    expect(screen.queryByTestId('away-summary')).toBeNull();
  });

  it('shows no speed window and no speed bar (marking is automatic), and "In progress"', async () => {
    const running = royaleFixture();
    serveMatch(slow, { ...running, markingMode: 'auto', events: running.events.slice(0, 11) });
    await show(<MatchScreen code="SLOW01" />);
    expect(screen.getByTestId('current-ball')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Speed window');
    expect(document.querySelector('.window-bar')).toBeNull();
    expect(document.querySelector('.sbr-badge-live')?.textContent).toBe('In progress');
  });
});

describe('the host console of an asynchronous match', () => {
  it("gives the host console's timed draws in minutes", async () => {
    const running = royaleFixture();
    serveMatch(
      { ...slow, youHost: true },
      { ...running, markingMode: 'auto', events: running.events.slice(0, 11) },
    );
    await show(<HostConsole code="SLOW01" />);
    const field = screen.getByTestId<HTMLInputElement>('host-minutes');
    expect(field.value).toBe('15');
    expect(field.closest('label')?.textContent).toContain('Minutes between timed draws');
    expect(screen.queryByTestId('host-seconds')).toBeNull();
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.blur(field);
    expect(document.body.textContent).toContain('Pick 1 to 1440 minutes between draws.');
  });

  it('offers "Jump ahead" in development builds, which moves the match a day on', async () => {
    const running = royaleFixture();
    const fetched = serveMatch(
      { ...slow, youHost: true },
      { ...running, markingMode: 'auto', events: running.events.slice(0, 11) },
    );
    await show(<HostConsole code="SLOW01" />);
    const day = await screen.findByRole('button', { name: 'Jump ahead 1 day' });
    expect(screen.getByRole('button', { name: 'Jump ahead 1 hour' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(day);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const call = fetched.mock.calls.find(([url]) => String(url).endsWith('/dev/time-travel'));
    const sent = (call?.[1] as { body?: string } | undefined)?.body ?? 'null';
    expect(JSON.parse(sent)).toEqual({
      code: 'SLOW01',
      ms: 86_400_000,
    });
  });
});

describe('the away summary in words', () => {
  it('tells a survived cut and the cut that put the player out, and the final place', () => {
    const out = awayLines({ ...away, eliminated: true, rankNow: null });
    expect(out).toContain('You survived 1 cut, then went out in a cut — you can still watch.');
    const over = awayLines({ ...away, finished: true, finalPlace: 3, rankNow: null });
    expect(over).toContain('The match is over — you finished in place 3.');
  });
});

describe('the away summary under strict mode', () => {
  it('shows the first answer although the effect ran twice (the fetch acknowledges)', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;
        const summary = calls === 1 ? away : null;
        return Promise.resolve(new Response(JSON.stringify({ summary })));
      }),
    );
    render(
      <StrictMode>
        <AwaySummary code="SLOW01" />
      </StrictMode>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls).toBe(2);
    expect(screen.getByTestId('away-summary').getAttribute('data-draws')).toBe('61');
  });
});
