// @vitest-environment jsdom
/**
 * @file   apps/web/src/newRun.test.tsx
 * @module web
 * @brief  A new Quick Test run starts from its own state only (owner report 2026-10-20).
 *
 * Responsibility: render the page, play run A (mark a cell, close a cut screen), press
 *                 Run Quick Test again and check that nothing of run A remains: no mark,
 *                 speed bonus or feedback on the owner card, and the cut screen
 *                 shows again at run B's first cut.
 * Depends on:     @testing-library/react, ./App, ./test/quickTestFixture
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { royaleFixture } from './test/quickTestFixture.js';

beforeEach(() => {
  vi.useFakeTimers();
  // Every press of Run Quick Test gets a fresh result object, as from the server.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(royaleFixture('manual'))))),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function startRun(): Promise<void> {
  fireEvent.click(screen.getByTestId('start-run'));
  // Let the mocked fetch resolve and React render the result.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function nextDraw(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000); // fixture draw interval
  });
}

// The fixture's speed window, then one more flush: React schedules the timer of a step
// only after the act() that showed it has finished.
async function closeWindow(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('a new run', () => {
  it('starts the owner card from the new run only, even in the same round', async () => {
    render(<App />);
    await startRun();
    await nextDraw(); // draw 1: number 1, on the owner card at cell 0
    fireEvent.click(screen.getByTestId('owner-cell-0'));
    expect(screen.getByTestId('owner-cell-0').getAttribute('data-marked')).toBe('true');
    expect(screen.getByTestId('owner-bonus').textContent).not.toMatch(/^\+0 speed bonus/);

    await startRun(); // run B, restarted while run A was still in round 1
    expect(screen.getByTestId('owner-cell-0').getAttribute('data-marked')).toBe('false');
    const marked = screen
      .getAllByTestId(/^owner-cell-/)
      .filter((cell) => cell.getAttribute('data-marked') === 'true');
    expect(marked.map((cell) => cell.getAttribute('data-testid'))).toEqual(['owner-cell-12']);
    expect(screen.getByTestId('owner-bonus').textContent).toBe(
      '+0 speed bonus (not counted in Quick Test cuts)',
    );
    expect(screen.getByTestId('owner-feedback').textContent).toBe(
      'Tap a drawn number on your card.',
    );
  });

  it("shows the next run's first cut screen after the last run's was closed", async () => {
    render(<App />);
    await startRun();
    await nextDraw();
    await nextDraw(); // draw 2, the round's last
    await closeWindow(); // its window closes with the first cut
    fireEvent.click(screen.getByText('Watch'));
    expect(screen.queryByTestId('cut-screen')).toBeNull();

    await startRun(); // run B
    await nextDraw();
    await nextDraw(); // run B's draw 2
    await closeWindow(); // the first cut
    expect(screen.getByTestId('cut-screen')).toBeTruthy();
  });
});
