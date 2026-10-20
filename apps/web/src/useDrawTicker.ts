/**
 * @file   apps/web/src/useDrawTicker.ts
 * @module web
 * @brief  React hook that plays a Quick Test back one draw at a time under draw control (D8).
 *
 * Responsibility: own the playback step for one result: start before the first draw;
 *                 in `auto` mode reveal one draw with its events after each interval; in
 *                 `host` mode reveal one only when drawNext() is called. Switching mode or
 *                 interval mid-match takes effect from the current draw; the draw order
 *                 never changes. "Skip to end" jumps to the end. A new result starts over.
 * Depends on:     react, ./drawControl, ./types
 * Used by:        ./App
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useState } from 'react';

import { autoIntervalMs, firstStep, nextStep, type DrawControl } from './drawControl.js';
import type { QuickTestResult } from './types.js';

export interface DrawTicker {
  readonly step: number;
  // Host mode: show the next draw now. Does nothing once the match is fully shown.
  readonly drawNext: () => void;
}

export function useDrawTicker(result: QuickTestResult | null, control: DrawControl): DrawTicker {
  const [playing, setPlaying] = useState<{ result: QuickTestResult | null; step: number }>({
    result: null,
    step: 0,
  });
  // A new result restarts playback before its first draw.
  const current =
    playing.result === result
      ? playing
      : { result, step: result === null ? 0 : firstStep(result.events) };
  if (current !== playing) setPlaying(current);
  const { step } = current;
  const done = result === null || step >= result.events.length;
  const intervalMs = result === null ? 0 : autoIntervalMs(control, result);
  useEffect(() => {
    if (result === null || done) return undefined;
    if (control.skipped) {
      setPlaying({ result, step: result.events.length });
      return undefined;
    }
    if (control.mode === 'host') return undefined;
    // One timer per draw: the next draw shows one full interval after this one, or after
    // a switch to `auto` / a new interval.
    const id = window.setTimeout(() => {
      setPlaying({ result, step: nextStep(result.events, step) });
    }, intervalMs);
    return () => {
      window.clearTimeout(id);
    };
  }, [result, step, done, control.skipped, control.mode, intervalMs]);
  const drawNext = (): void => {
    if (result === null) return;
    // Functional update: two quick presses are two draws, never one.
    setPlaying((prev) =>
      prev.result === result ? { result, step: nextStep(result.events, prev.step) } : prev,
    );
  };
  return { step, drawNext };
}
