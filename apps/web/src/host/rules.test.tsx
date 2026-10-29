// @vitest-environment jsdom
/**
 * @file   apps/web/src/host/rules.test.tsx
 * @module web/host
 * @brief  The owner's timing rules on screen: D12 (shortest interval), D13 (Draw next lock), D14 (pause).
 *
 * Responsibility: the create form refuses seconds below 1 s more than the longest tap time
 *                 with a plain message and sends the royale pause choice; the live seconds
 *                 field does not send a too-short interval; Draw next counts down while it
 *                 is locked; the console offers "Start next round" and players read
 *                 "Waiting for the host to start round N" while the match waits for the host.
 * Depends on:     @testing-library/react, vitest, ./CreateMatch, ./HostDrawControls,
 *                 ./HostConsole, ../game/MatchScreen, ../test/matchFixture, ../test/quickTestFixture,
 *                 ../game/useLiveMatch, ./createForm, ../playback
 * Spec:           docs/spec/01-game-design.md §5, §7.1 (D12, D13, D14)
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MatchScreen } from '../game/MatchScreen.js';
import type { LiveState, MatchSummary } from '../game/useLiveMatch.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../test/quickTestFixture.js';
import { CreateMatch } from './CreateMatch.js';
import { createBody } from './createForm.js';
import { HostConsole } from './HostConsole.js';
import { HostDrawControls } from './HostDrawControls.js';

const sent = vi.fn((..._args: unknown[]) => Promise.resolve({ ok: true }));
vi.mock('../game/socket.js', () => ({
  gameSocket: () => ({ on: () => undefined, off: () => undefined, connected: false }),
  intent: (...args: unknown[]) => sent(...args),
  resetSocket: () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sent.mockClear();
});

// A running royale match with host draws, as the rules tests need it.
function summary(over: Partial<MatchSummary> = {}): MatchSummary {
  return matchSummary({
    code: 'RULES1',
    title: 'Rules',
    status: 'running',
    players: 3,
    settings: {
      markingMode: 'manual',
      missedNumbers: { kind: 'autoMarkAfter', delayMs: 5000 },
      drawMode: 'host',
      drawIntervalMs: 6000,
      roundPause: { kind: 'host' },
      startRule: { kind: 'host' },
    },
    youHost: true,
    ...over,
  });
}

const serve = serveMatch;

describe('D12: the shortest timed-draw interval', () => {
  it('refuses seconds below the longest tap time plus 1 s with a plain message', async () => {
    const fetch = serve(summary());
    await show(<CreateMatch />);
    fireEvent.change(screen.getByTestId('missed-delay'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('start-draw-interval'), { target: { value: '5' } });
    expect(screen.getByTestId('create-interval-problem').textContent).toContain(
      'at least 6 seconds',
    );
    fireEvent.click(screen.getByTestId('create-submit'));
    const calls = fetch.mock.calls as [string, RequestInit | undefined][];
    const posts = calls.filter(
      ([url, init]) => url.endsWith('/matches') && init?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByTestId('start-draw-interval'), { target: { value: '6' } });
    expect(screen.queryByTestId('create-interval-problem')).toBeNull();
  });

  it('does not send a too-short interval from the live seconds field', () => {
    const live = {
      match: summary({ settings: { ...summary().settings, drawMode: 'auto' } }),
      view: { ...royaleFixture(), drawIntervalRangeMs: { min: 6000, max: 60_000 } },
    } as unknown as LiveState;
    render(<HostDrawControls live={live} view={playbackAt(royaleFixture(), 0)} />);
    const field = screen.getByTestId('host-seconds');
    fireEvent.change(field, { target: { value: '4' } });
    fireEvent.blur(field);
    expect(sent).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 6 seconds/)).toBeTruthy();
  });
});

describe('D13: Draw next unlocks with the timed interval', () => {
  it('shows the remaining seconds and stays disabled until then', () => {
    const live = {
      match: summary({ nextDrawAt: Date.now() + 3_000 }),
      view: { ...royaleFixture(), events: [] },
    } as unknown as LiveState;
    render(<HostDrawControls live={live} view={playbackAt(royaleFixture(), 0)} />);
    const button = screen.getByTestId<HTMLButtonElement>('host-draw-next');
    expect(button.textContent).toBe('Draw next in 3 s');
    expect(button.disabled).toBe(true);
  });
});

describe('D14: the pause between royale rounds', () => {
  it('sends the chosen pause with a new royale match', () => {
    const body = createBody({
      title: 't',
      gameType: 'royale',
      prizes: new Set(),
      draw: { mode: 'host', intervalSec: null, skipped: false },
      missed: { mode: 'manual', missed: 'noAutoMark', delaySec: 3 },
      leaderboard: null,
      maxPlayers: 20,
      pause: { kind: 'host' },
      fast: false,
      start: { kind: 'host' },
    });
    expect(body.roundPause).toEqual({ kind: 'host' });
  });

  it('offers the host "Start next round" and tells players to wait', async () => {
    serve(summary({ waitingForHost: true }));
    await show(<HostConsole code="RULES1" />);
    fireEvent.click(screen.getByTestId('host-next-round'));
    expect(sent).toHaveBeenCalledWith('round.next', { code: 'RULES1' });
    cleanup();
    // The match right after its first cut: round 1 is over, round 2 not started.
    const afterCut = royaleFixture();
    serve(summary({ waitingForHost: true, youHost: false }), {
      ...afterCut,
      events: afterCut.events.slice(0, 11),
    });
    await show(<MatchScreen code="RULES1" />);
    expect(screen.getByTestId('waiting-for-host').textContent).toBe(
      'Waiting for the host to start round 2',
    );
  });
});

describe('D21: a 15 s pause the host can end early', () => {
  // The match right after its first cut, in a timed pause (round 2 starts in 10 s).
  const afterCut = royaleFixture();
  const inPause = { ...afterCut, events: afterCut.events.slice(0, 11) };
  const timed = (over: Partial<MatchSummary> = {}) =>
    summary({
      settings: { ...summary().settings, roundPause: { kind: 'wait', ms: 15_000 } },
      nextRoundAt: Date.now() + 10_000,
      ...over,
    });

  it('offers 15 seconds as the pause in the create form', async () => {
    serve(summary());
    await show(<CreateMatch />);
    fireEvent.change(screen.getByTestId('create-game-type'), { target: { value: 'royale' } });
    expect(screen.getByTestId<HTMLInputElement>('create-round-pause-sec').value).toBe('15');
  });

  it('offers the host "Start next round now" and no Draw next during the pause', async () => {
    serve(timed(), inPause);
    await show(<HostConsole code="RULES1" />);
    expect(screen.queryByTestId('host-draw-next')).toBeNull();
    expect(screen.queryByText(/Draw next opens/)).toBeNull();
    expect(screen.queryByTestId('host-next-round')).toBeNull();
    fireEvent.click(screen.getByTestId('host-next-round-now'));
    expect(sent).toHaveBeenCalledWith('round.next', { code: 'RULES1' });
  });

  it('shows players "Round over" instead of the last ball until the next first draw', async () => {
    serve(timed({ youHost: false }), inPause);
    await show(<MatchScreen code="RULES1" />);
    const ball = screen.getByTestId('current-ball');
    expect(ball.textContent).toBe('Round over');
    expect(ball.getAttribute('data-item')).toBeNull();
    cleanup();
    // The next round started, no number drawn yet.
    serve(timed({ youHost: false, nextRoundAt: null }), {
      ...afterCut,
      events: afterCut.events.slice(0, 13),
    });
    await show(<MatchScreen code="RULES1" />);
    expect(screen.getByTestId('current-ball').textContent).toBe('Waiting for the first number');
  });
});
