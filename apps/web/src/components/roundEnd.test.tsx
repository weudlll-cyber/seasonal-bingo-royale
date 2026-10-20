// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/roundEnd.test.tsx
 * @module web
 * @brief  A round's last number stays on screen; the round end closes taps (01 §6).
 *
 * Responsibility: in the two-round fixture, draw 2 is round 1's last: after it the ticker
 *                 still shows it on the round 1 card (acceptance play-through found it was
 *                 never shown), a tap on it is refused and nothing is marked for the
 *                 owner after the delay; the next draw deals round 2.
 * Depends on:     @testing-library/react, ../App, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { royaleFixture } from '../quickTestFixture.js';

beforeEach(() => {
  vi.useFakeTimers();
  const result = royaleFixture('manual', { kind: 'autoMarkAfter', delayMs: 3000 });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const tickerItems = () =>
  [...screen.getByTestId('draw-ticker').children].map((el) => el.getAttribute('data-item'));

describe("a round's last number", () => {
  it('is shown on the old card, refuses taps and is not marked for the owner', async () => {
    render(<App />);
    fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
    fireEvent.click(screen.getByTestId('start-run'));
    await wait(0);
    fireEvent.click(screen.getByTestId('draw-next')); // draw 1: number 1
    fireEvent.click(screen.getByTestId('draw-next')); // draw 2: number 2, round 1 ends
    expect(tickerItems()).toEqual(['1', '2']);
    const last = screen.getByTestId('owner-cell-1'); // number 2 on the round 1 card
    expect(last.getAttribute('data-value')).toBe('2');
    fireEvent.click(last);
    expect(last.getAttribute('data-marked')).toBe('false');
    expect(screen.getByTestId('owner-feedback').textContent).toBe('Round over — no more taps');
    await wait(5_000);
    expect(screen.getByTestId('owner-cell-1').getAttribute('data-marked')).toBe('false');

    fireEvent.click(screen.getByTestId('draw-next')); // round 2 with its first number
    expect(tickerItems()).toEqual(['4']);
  });
});
