// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/acceptanceFixes.test.tsx
 * @module web
 * @brief  Failures found by the acceptance play-through, each pinned by a test.
 *
 * Responsibility: (A) while the owner taps, no rendered frame shows the seasons counter
 *                 disagreeing with the owner's marked season cells; (B) after the round
 *                 of the cut, an eliminated owner's old card is gone (it showed marks for
 *                 numbers not drawn in the current round and could be tapped).
 * Depends on:     @testing-library/react, react, ../App, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §6, §7, §13; docs/spec/12-testing-strategy.md §8
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import { royaleFixture } from '../quickTestFixture.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// The page with the two-round fixture and host draws.
async function startHostRun(marking: 'auto' | 'manual', onCommit?: () => void): Promise<void> {
  vi.useFakeTimers();
  const result = royaleFixture(marking, { kind: 'autoMarkAfter', delayMs: 3000 });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  );
  render(
    <Profiler id="page" onRender={() => onCommit?.()}>
      <App />
    </Profiler>,
  );
  if (marking === 'auto') {
    fireEvent.change(screen.getByTestId('marking-mode'), { target: { value: 'auto' } });
  }
  fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
  fireEvent.click(screen.getByTestId('start-run'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

// Every committed frame: the counter equals the marked season cells on the owner's card.
function counterMatchesCard(): string | null {
  const counter = document.querySelector<HTMLElement>('[data-testid="seasons-collected"]');
  if (counter === null) return null;
  const marked = [...document.querySelectorAll<HTMLElement>('[data-testid^="owner-cell-"]')].filter(
    (c) => c.dataset['marked'] === 'true' && c.dataset['season'] !== '',
  ).length;
  return counter.dataset['count'] === String(marked)
    ? null
    : `counter ${counter.dataset['count'] ?? ''} ≠ ${String(marked)}`;
}

describe('found by the acceptance play-through', () => {
  it('(A) never renders a frame where the seasons counter disagrees with the card', async () => {
    const mismatches: string[] = [];
    await startHostRun('manual', () => {
      const m = counterMatchesCard();
      if (m !== null) mismatches.push(m);
    });
    fireEvent.click(screen.getByTestId('draw-next')); // number 1 on spring cell 0
    fireEvent.click(screen.getByTestId('owner-cell-0'));
    expect(screen.getByTestId('seasons-collected').dataset['count']).toBe('1');
    expect(mismatches).toEqual([]);
  });

  it.each(['manual', 'auto'] as const)(
    '(B) %s: the eliminated owner keeps the card for the cut round only',
    async (marking) => {
      await startHostRun(marking);
      fireEvent.click(screen.getByTestId('draw-next'));
      fireEvent.click(screen.getByTestId('draw-next')); // round 1's last draw and the cut
      expect(screen.queryAllByTestId(/^owner-cell-/)).toHaveLength(25);
      fireEvent.click(screen.getByTestId('draw-next')); // round 2: no card for the owner
      expect(screen.queryAllByTestId(/^owner-cell-/)).toHaveLength(0);
    },
  );
});
