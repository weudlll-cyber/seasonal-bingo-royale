// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/interlude.test.tsx
 * @module web/game
 * @brief  The interlude between royale rounds (D20): its cards, timing, motion and who sees it.
 *
 * Responsibility: which cards a pause shows (all of them at a calm pace; with a short
 *                 timed pause the most important first, never rushed; the host's pause
 *                 loops); each card's content from the server's recap; a timed pause
 *                 advancing by itself to "Next round in N s"; a host-started pause going
 *                 round until the host starts the round, Start next round staying in view;
 *                 no motion under prefers-reduced-motion; an eliminated player and a
 *                 spectator seeing it too.
 * Depends on:     @testing-library/react, vitest, @sbr/contracts (types), ./Interlude,
 *                 ./interludePlan, ./MatchScreen, ../host/HostConsole, ../test/*
 * Spec:           docs/spec/01-game-design.md §7 (D14, D20), §13
 */
import type { RoundRecap } from '@sbr/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostConsole } from '../host/HostConsole.js';
import { matchSummary, serveMatch, show } from '../test/matchFixture.js';
import { royaleFixture } from '../test/quickTestFixture.js';
import { Interlude } from './Interlude.js';
import { CALM_CARD_MS, planInterlude } from './interludePlan.js';
import { MatchScreen } from './MatchScreen.js';

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

const RECAP: RoundRecap = {
  roundIndex: 0,
  top: [
    { name: 'bot-02', points: 30 },
    { name: 'owner-01', points: 10 },
    { name: 'bot-03', points: 5 },
  ],
  climber: { name: 'bot-03', from: 6, to: 2 },
  cut: {
    outCount: 9,
    out: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'owner-01'],
    saved: ['bot-03'],
  },
  seasonComplete: ['bot-02'],
  fastest: { name: 'owner-01', averageMs: 640, taps: 7 },
  facts: { numbersDrawn: 12, playersLeft: 11 },
};

const motion = (reduce: boolean): void => {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduce,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};

describe('which cards a pause shows (D20)', () => {
  it('shows every card at a calm pace when the pause allows, sharing it evenly', () => {
    const plan = planInterlude(RECAP, { kind: 'wait', ms: 30_000 }, null);
    expect(plan.cards).toEqual(['top', 'climber', 'cut', 'seasons', 'facts']);
    expect(plan.cardMs).toBe(6_000);
    expect(plan.loop).toBe(false);
  });

  it('keeps the most important cards when the pause is short, never rushing them', () => {
    expect(planInterlude(RECAP, { kind: 'wait', ms: 6_000 }, null).cards).toEqual(['top']);
    const twelve = planInterlude(RECAP, { kind: 'wait', ms: 30_000 }, 12_000);
    expect(twelve.cards).toEqual(['top', 'cut', 'seasons']);
    expect(twelve.cardMs).toBe(CALM_CARD_MS);
  });

  it('leaves out cards without content and loops all cards while the host decides', () => {
    const bare: RoundRecap = { roundIndex: 0, facts: { numbersDrawn: 3, playersLeft: 4 } };
    expect(planInterlude(bare, { kind: 'host' }, null)).toEqual({
      cards: ['facts'],
      cardMs: CALM_CARD_MS,
      loop: true,
    });
    expect(planInterlude(RECAP, { kind: 'host' }, null).cards).toHaveLength(5);
  });
});

describe('the recap cards (D20)', () => {
  it('shows each card from the server recap, the viewer highlighted', () => {
    motion(false);
    render(<Interlude recap={RECAP} pause={{ kind: 'host' }} nextRoundAt={null} me="owner-01" />);
    const next = (): void => {
      fireEvent.click(screen.getByTestId('interlude-next'));
    };
    expect(screen.getByTestId('recap-top-1').textContent).toContain('bot-02');
    expect(screen.getByTestId('recap-top-2').className).toContain('is-own');
    expect(screen.getByTestId('interlude-step').textContent).toBe('Card 1 of 5');
    next();
    expect(screen.getByTestId('recap-climber').textContent).toContain('up from #6 to #2');
    next();
    expect(screen.getByTestId('interlude-card-cut').textContent).toContain('9 players are out');
    expect(screen.getByTestId('recap-out').textContent).toContain('and 1 more');
    expect(screen.getByTestId('recap-saved').textContent).toContain('bot-03');
    next();
    expect(screen.getByTestId('recap-season-complete').textContent).toContain(
      'bot-02 collected all four seasons',
    );
    expect(screen.getByTestId('recap-fastest').textContent).toBe(
      'Fastest tapper: owner-01 — 0.6 s on average over 7 taps',
    );
    next();
    expect(screen.getByTestId('interlude-card-facts').textContent).toBe(
      '12 numbers drawn · 11 players still in',
    );
  });
});

// One card's time after another: each card's timer starts once React has shown the card.
function passCards(count: number): void {
  for (let i = 0; i < count; i += 1) {
    act(() => {
      vi.advanceTimersByTime(CALM_CARD_MS);
    });
  }
}

describe('the interlude over the pause (D14, D20)', () => {
  it('advances by itself in a timed pause and ends with the countdown', () => {
    vi.useFakeTimers();
    motion(false);
    const at = Date.now() + 20_000;
    render(
      <Interlude recap={RECAP} pause={{ kind: 'wait', ms: 20_000 }} nextRoundAt={at} me={null} />,
    );
    expect(screen.getByTestId('interlude-countdown').textContent).toBe('Next round in 20 s');
    act(() => {
      vi.advanceTimersByTime(CALM_CARD_MS);
    });
    expect(screen.getByTestId('interlude-step').textContent).toBe('Card 2 of 5');
    passCards(10);
    expect(screen.getByTestId('interlude-step').textContent).toBe('Card 5 of 5');
    expect(screen.getByTestId('interlude-next')).toHaveProperty('disabled', true);
  });

  it('goes round while the host decides, without a countdown', () => {
    vi.useFakeTimers();
    motion(false);
    render(<Interlude recap={RECAP} pause={{ kind: 'host' }} nextRoundAt={null} me={null} />);
    passCards(5);
    expect(screen.getByTestId('interlude-step').textContent).toBe('Card 1 of 5');
    expect(screen.queryByTestId('interlude-countdown')).toBeNull();
  });

  it('moves without animation under prefers-reduced-motion', () => {
    motion(true);
    render(<Interlude recap={RECAP} pause={{ kind: 'host' }} nextRoundAt={null} me={null} />);
    expect(screen.getByTestId('interlude-card-top').className).not.toContain('sbr-anim-fade');
    cleanup();
    motion(false);
    render(<Interlude recap={RECAP} pause={{ kind: 'host' }} nextRoundAt={null} me={null} />);
    expect(screen.getByTestId('interlude-card-top').className).toContain('sbr-anim-fade');
  });
});

// The fixture's royale paused after its first round: owner-01 is out in the cut.
function servePause(spectator: boolean, waitingForHost = false): void {
  const view = royaleFixture();
  const paused = {
    ...view,
    events: view.events.slice(0, 11),
    recaps: [RECAP],
    ...(spectator
      ? { ownerAccountIds: [], players: view.players.map((p) => ({ ...p, isOwner: false })) }
      : {}),
  };
  serveMatch(
    matchSummary({
      status: 'running',
      youHost: waitingForHost,
      waitingForHost,
      ...(waitingForHost
        ? { settings: { ...matchSummary().settings, roundPause: { kind: 'host' } } }
        : {}),
    }),
    paused,
  );
}

describe('who sees the interlude (D20)', () => {
  it('an eliminated player and a spectator see the recap', async () => {
    motion(false);
    servePause(false);
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('cut-screen').textContent).toContain("You're out in cut 1");
    expect(screen.getByTestId('interlude')).toBeTruthy();
    cleanup();
    servePause(true);
    await show(<MatchScreen code="MATCH1" />);
    expect(screen.getByTestId('spectating')).toBeTruthy();
    expect(screen.getByTestId('interlude')).toBeTruthy();
  });

  it('the host sees it below Start next round, which stays in view', async () => {
    motion(false);
    servePause(true, true);
    await show(<HostConsole code="MATCH1" />);
    expect(screen.getByTestId('host-next-round')).toBeTruthy();
    expect(screen.getByTestId('interlude')).toBeTruthy();
  });
});
