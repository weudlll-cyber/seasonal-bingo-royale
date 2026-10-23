// @vitest-environment jsdom
/**
 * @file   apps/web/src/useDrawTicker.test.tsx
 * @module web
 * @brief  Draw control of the Quick Test playback (D8): `auto` interval and `host` draws.
 *
 * Responsibility: prove that every step reveals exactly one draw with its events, and
 *                 the close of its speed window (round end, cut) when the window runs
 *                 out, in both modes (D10);
 *                 `auto` waits the chosen interval (the ruleset's when none is set,
 *                 clamped to the allowed range); `host` shows nothing until drawNext();
 *                 switching mid-match takes effect from the current draw; skip jumps to
 *                 the end.
 * Depends on:     @testing-library/react, ./useDrawTicker, ./drawControl, ./playback,
 *                 ./test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INITIAL_CONTROL, type DrawControl } from './drawControl.js';
import { playbackAt } from './playback.js';
import { royaleFixture } from './test/quickTestFixture.js';
import { useDrawTicker } from './useDrawTicker.js';

// The fixture: drawIntervalMs 1000 (allowed 500–60000), speed window 500; draws at event
// indices 2, 6, 13 and their window closes at 5, 8, 14, of 17 events.
const result = royaleFixture();
const DRAW_MS = result.drawIntervalMs;
const WINDOW_MS = result.speedWindowMs;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function play(control: Partial<DrawControl>) {
  return renderHook(({ c }: { c: DrawControl }) => useDrawTicker(result, c), {
    initialProps: { c: { ...INITIAL_CONTROL, ...control } },
  });
}

const drawsShown = (step: number): number => playbackAt(result, step).drawsSoFar.length;

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useDrawTicker — auto', () => {
  it('reveals exactly one draw per step, each after the ruleset interval', () => {
    const { result: hook } = play({});
    expect(hook.current.step).toBe(2); // everything before the first draw
    advance(DRAW_MS - 1);
    expect(drawsShown(hook.current.step)).toBe(0);
    advance(1);
    expect(hook.current.step).toBe(5); // draw 1 with its mark and season activation
    advance(WINDOW_MS);
    expect(hook.current.step).toBe(6); // its speed window closes
    advance(DRAW_MS - WINDOW_MS);
    // Draw 2 is the round's last: the round stays open while its window runs (D10).
    expect(hook.current.step).toBe(8);
    expect(playbackAt(result, 8).roundOver).toBe(false);
    advance(WINDOW_MS);
    // The window closes: round end and cut, before the next stage.
    expect(hook.current.step).toBe(11);
    expect(playbackAt(result, 11).roundOver).toBe(true);
    advance(DRAW_MS - WINDOW_MS);
    // Next stage and round come with their first draw; its window close ends the match.
    expect(hook.current.step).toBe(14);
    advance(WINDOW_MS);
    expect(hook.current.step).toBe(result.events.length);
  });

  it('waits the interval the starter set, clamped to the allowed range', () => {
    const slow = play({ intervalSec: 2 });
    advance(1999);
    expect(drawsShown(slow.result.current.step)).toBe(0);
    advance(1);
    expect(drawsShown(slow.result.current.step)).toBe(1);
    cleanup();
    const tooFast = play({ intervalSec: 0.1 }); // below the 500 ms minimum
    advance(499);
    expect(drawsShown(tooFast.result.current.step)).toBe(0);
    advance(1);
    expect(drawsShown(tooFast.result.current.step)).toBe(1);
  });
});

describe('useDrawTicker — host and switching', () => {
  it('in host mode shows nothing until drawNext, then exactly one draw each time', () => {
    const { result: hook } = play({ mode: 'host' });
    advance(DRAW_MS * 10);
    expect(drawsShown(hook.current.step)).toBe(0);
    act(() => {
      hook.current.drawNext();
    });
    expect(drawsShown(hook.current.step)).toBe(1);
    act(() => {
      hook.current.drawNext();
      hook.current.drawNext();
    });
    // Draws 2 and 3: two presses; each first closes the open window of the draw before.
    expect(drawsShown(hook.current.step)).toBe(1); // round 2 shows its first number
    expect(hook.current.step).toBe(14);
    advance(WINDOW_MS); // the last window closes on its own, also in host mode
    expect(hook.current.step).toBe(result.events.length);
  });

  it('switching host → auto resumes after one interval; auto → host stops', () => {
    const { result: hook, rerender } = play({ mode: 'host' });
    advance(DRAW_MS * 5);
    rerender({ c: { ...INITIAL_CONTROL, mode: 'auto' } });
    advance(DRAW_MS - 1);
    expect(drawsShown(hook.current.step)).toBe(0);
    advance(1);
    expect(drawsShown(hook.current.step)).toBe(1);
    rerender({ c: { ...INITIAL_CONTROL, mode: 'host' } });
    advance(DRAW_MS * 5);
    expect(drawsShown(hook.current.step)).toBe(1);
  });

  it('jumps to the end on skip, in either mode', () => {
    const { result: hook, rerender } = play({ mode: 'host' });
    rerender({ c: { ...INITIAL_CONTROL, mode: 'host', skipped: true } });
    expect(hook.current.step).toBe(result.events.length);
  });
});
