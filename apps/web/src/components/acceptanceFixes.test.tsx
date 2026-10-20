// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/acceptanceFixes.test.tsx
 * @module web
 * @brief  Failures found by the acceptance play-through, each pinned by a test.
 *
 * Responsibility: after the round of the cut, an eliminated owner's old card is gone (it
 *                 showed marks for numbers not drawn in the current round and could be
 *                 tapped).
 * Depends on:     @testing-library/react, ../App, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §6, §7, §13; docs/spec/12-testing-strategy.md §8
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { royaleFixture } from '../quickTestFixture.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

// The page with the two-round fixture and host draws.
async function startHostRun(marking: 'auto' | 'manual'): Promise<void> {
  vi.useFakeTimers();
  const result = royaleFixture(marking, { kind: 'autoMarkAfter', delayMs: 3000 });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  );
  render(<App />);
  if (marking === 'auto') {
    fireEvent.change(screen.getByTestId('marking-mode'), { target: { value: 'auto' } });
  }
  fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
  fireEvent.click(screen.getByTestId('start-run'));
  await wait(0);
}

describe('found by the acceptance play-through', () => {
  it.each(['manual', 'auto'] as const)(
    '%s: the eliminated owner keeps the card for the cut round only',
    async (marking) => {
      await startHostRun(marking);
      fireEvent.click(screen.getByTestId('draw-next'));
      fireEvent.click(screen.getByTestId('draw-next')); // round 1's last draw
      await wait(500); // its window closes with the cut
      expect(screen.queryAllByTestId(/^owner-cell-/)).toHaveLength(25);
      fireEvent.click(screen.getByTestId('draw-next')); // round 2: no card for the owner
      expect(screen.queryAllByTestId(/^owner-cell-/)).toHaveLength(0);
    },
  );
});
