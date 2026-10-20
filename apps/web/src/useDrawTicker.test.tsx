// @vitest-environment jsdom
/**
 * @file   apps/web/src/useDrawTicker.test.tsx
 * @module web
 * @brief  Playback advances one draw per tick at the ruleset draw interval (WP-08).
 *
 * Responsibility: prove that each tick reveals exactly one draw with all its events (up
 *                 to the next draw), that realtime waits exactly `drawIntervalMs`,
 *                 slower twice and faster a quarter of it, and that skip jumps to the end.
 * Depends on:     @testing-library/react, ./useDrawTicker, ./playback, ./quickTestFixture
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaceLabel } from './drawPace.js';
import { playbackAt } from './playback.js';
import { royaleFixture } from './quickTestFixture.js';
import { useDrawTicker } from './useDrawTicker.js';

// The fixture: drawIntervalMs 1000; draws at event indices 2, 5 and 11 of 14 events.
const result = royaleFixture();
const DRAW_MS = result.drawIntervalMs;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function play(pace: PaceLabel) {
  return renderHook(({ p }: { p: PaceLabel }) => useDrawTicker(result, p), {
    initialProps: { p: pace },
  });
}

const drawsShown = (step: number): number => playbackAt(result, step).drawsSoFar.length;

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useDrawTicker', () => {
  it('reveals exactly one draw per tick, each after exactly drawIntervalMs (realtime)', () => {
    const { result: hook } = play('realtime');
    expect(hook.current).toBe(2); // everything before the first draw, no draw yet
    expect(drawsShown(hook.current)).toBe(0);
    advance(DRAW_MS - 1);
    expect(drawsShown(hook.current)).toBe(0);
    advance(1);
    expect(hook.current).toBe(5); // draw 1 with its mark and season activation
    expect(drawsShown(hook.current)).toBe(1);
    advance(DRAW_MS);
    // Draw 2 with its mark, round end, cut, next stage and round, up to draw 3.
    expect(hook.current).toBe(11);
    advance(DRAW_MS);
    expect(hook.current).toBe(result.events.length);
  });

  it('waits twice the draw interval when slower and a quarter when faster', () => {
    const slower = play('slower');
    advance(DRAW_MS * 2 - 1);
    expect(drawsShown(slower.result.current)).toBe(0);
    advance(1);
    expect(drawsShown(slower.result.current)).toBe(1);
    cleanup();
    const faster = play('faster');
    advance(DRAW_MS / 4);
    expect(drawsShown(faster.result.current)).toBe(1);
  });

  it('jumps to the end on skip', () => {
    const { result: hook, rerender } = play('realtime');
    rerender({ p: 'skip' });
    expect(hook.current).toBe(result.events.length);
  });
});
