// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/liveGame.test.tsx
 * @module web/game
 * @brief  Live match pieces: window state, rule wording, card refusals, Draw next guard.
 *
 * Responsibility: the latest draw's window is open until its speedWindowClosed; the rules
 *                 read in the Quick Test's words, never "auto" alone; the player's card
 *                 refuses undrawn numbers and taps after the round end without asking the
 *                 server, and sends a tap on a drawn number as a `mark` intent; Draw next is
 *                 disabled right after a press until the new draw has arrived.
 * Depends on:     @testing-library/react, ./LiveCard, ./labels, ../host/HostDrawControls,
 *                 ./useLiveMatch, ../playback, ../test/quickTestFixture, ../types
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/06-realtime-architecture.md §4.1
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostDrawControls, windowOpen } from '../host/HostDrawControls.js';
import type { PlaybackView } from '../playback.js';
import { numberCard, royaleFixture } from '../test/quickTestFixture.js';
import type { DomainEventLike } from '../types.js';
import { drawLine, missedLine } from './labels.js';
import { LiveCard } from './LiveCard.js';
import type { LiveState, MatchSummary } from './useLiveMatch.js';

const sent: { t: string; data: unknown }[] = [];
vi.mock('./socket.js', () => ({
  intent: (t: string, data: unknown) => {
    sent.push({ t, data });
    return Promise.resolve({ ok: true });
  },
}));

afterEach(() => {
  cleanup();
  sent.length = 0;
});

const ev = (type: string): DomainEventLike => ({ type }) as unknown as DomainEventLike;

describe('window state and wording', () => {
  it('keeps the latest draw window open until it closes', () => {
    expect(windowOpen([ev('roundStarted'), ev('drawMade')])).toBe(true);
    expect(windowOpen([ev('drawMade'), ev('cellMarked'), ev('speedWindowClosed')])).toBe(false);
    expect(windowOpen([ev('drawMade'), ev('speedWindowClosed'), ev('roundStarted')])).toBe(false);
  });

  it('describes draws and missed numbers without the word auto', () => {
    const settings: MatchSummary['settings'] = {
      markingMode: 'manual',
      missedNumbers: { kind: 'autoMarkAfter', delayMs: 3000 },
      drawMode: 'auto',
      drawIntervalMs: 5000,
      roundPause: { kind: 'wait', ms: 6000 },
      startRule: { kind: 'host' },
    };
    expect(drawLine(settings)).toBe('Draws: timed (every 5 seconds)');
    expect(missedLine(settings)).toBe('Missed numbers: marked for you after 3 seconds');
    expect(drawLine({ ...settings, drawMode: 'host' })).toBe('Draws: host presses Draw next');
    expect(missedLine({ ...settings, missedNumbers: { kind: 'noAutoMark' } })).toBe(
      'Missed numbers: left open (tap later without bonus)',
    );
  });
});

describe('the live card', () => {
  const card = numberCard(0); // numbers 1..24 around the free centre
  const props = {
    code: 'ABC',
    cardIndex: 0,
    card,
    marks: [],
    draws: [5],
    roundOver: false,
    canTap: true,
  };

  it('refuses an undrawn number and a tap after the round end without asking the server', () => {
    const { rerender } = render(<LiveCard {...props} />);
    fireEvent.click(screen.getByTestId('owner-cell-0')); // number 1, not drawn
    expect(screen.getByTestId('card-feedback').textContent).toBe('Not drawn yet — refused');
    rerender(<LiveCard {...props} roundOver />);
    fireEvent.click(screen.getByTestId('owner-cell-4')); // number 5, drawn
    expect(screen.getByTestId('card-feedback').textContent).toBe('Round over — no more taps');
    expect(sent).toEqual([]);
  });

  it('sends a tap on a drawn number as a mark intent', () => {
    render(<LiveCard {...props} />);
    fireEvent.click(screen.getByTestId('owner-cell-4'));
    expect(sent).toEqual([{ t: 'mark', data: { code: 'ABC', cardIndex: 0, cell: 4 } }]);
  });
});

describe('Draw next', () => {
  it('is disabled right after a press until the new draw has arrived', () => {
    const view = royaleFixture();
    const events = [ev('roundStarted'), ev('drawMade'), ev('speedWindowClosed')];
    const live = {
      match: { code: 'ABC', settings: { drawMode: 'host', drawIntervalMs: 5000 } },
      view: { ...view, events },
    } as unknown as LiveState;
    const pv = { roundOver: false, finished: false } as PlaybackView;
    const { rerender } = render(<HostDrawControls live={live} view={pv} />);
    const button = screen.getByTestId('host-draw-next');
    expect(button).toHaveProperty('disabled', false);
    fireEvent.click(button);
    expect(sent.map((s) => s.t)).toEqual(['draw.next']);
    expect(screen.getByTestId('host-draw-next')).toHaveProperty('disabled', true);
    const later = {
      ...live,
      view: { ...live.view, events: [...events, ev('drawMade'), ev('speedWindowClosed')] },
    };
    rerender(<HostDrawControls live={later} view={pv} />);
    expect(screen.getByTestId('host-draw-next')).toHaveProperty('disabled', false);
  });
});
