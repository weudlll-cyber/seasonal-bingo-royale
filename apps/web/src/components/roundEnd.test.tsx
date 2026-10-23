// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/roundEnd.test.tsx
 * @module web
 * @brief  A round's last number is tappable inside its window; then the round ends (D10).
 *
 * Responsibility: in the two-round fixture, draw 2 is round 1's last. While its speed
 *                 window runs the round is open: the number is shown and a tap marks it.
 *                 When the window closes the round ends: further taps are refused and
 *                 nothing more is marked for the owner. The next draw deals round 2.
 * Depends on:     @testing-library/react, ../App, ../test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { royaleFixture } from '../test/quickTestFixture.js';

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
const marked = (testId: string) => screen.getByTestId(testId).getAttribute('data-marked');

describe("a round's last number (D10)", () => {
  it('can be tapped inside its window; after the window the round is over', async () => {
    render(<App />);
    fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
    fireEvent.click(screen.getByTestId('start-run'));
    await wait(0);
    fireEvent.click(screen.getByTestId('draw-next')); // draw 1: number 1 (cell 0), left open
    fireEvent.click(screen.getByTestId('draw-next')); // draw 2: number 2, the round's last
    expect(tickerItems()).toEqual(['1', '2']);
    expect(screen.getByTestId('owner-cell-1').getAttribute('data-value')).toBe('2');
    fireEvent.click(screen.getByTestId('owner-cell-1'));
    expect(marked('owner-cell-1')).toBe('true');
    expect(screen.queryByTestId('cut-screen')).toBeNull();

    await wait(500); // the window closes: round end and cut
    expect(screen.getByTestId('cut-screen')).toBeTruthy();
    fireEvent.click(screen.getByTestId('owner-cell-0'));
    expect(marked('owner-cell-0')).toBe('false');
    expect(screen.getByTestId('owner-feedback').textContent).toBe('Round over — no more taps');
    await wait(5_000);
    expect(marked('owner-cell-0')).toBe('false');

    fireEvent.click(screen.getByTestId('draw-next')); // round 2 with its first number
    expect(tickerItems()).toEqual(['4']);
  });
});
