/**
 * @file   apps/web/src/useDrawTicker.ts
 * @module web
 * @brief  React hook that plays a Quick Test back one draw at a time under draw control (D8).
 *
 * Responsibility: own the playback step for one result: start before the first draw;
 *                 in `auto` mode reveal one draw after each interval; in `host` mode
 *                 reveal one only when drawNext() is called. In both modes the close of a
 *                 draw's speed window — with what it decides: prizes, round end, cut — is
 *                 revealed when that window has run out (D10). Timed draws follow one
 *                 interval after the previous draw, or after a switch to `auto` / a new
 *                 interval. The draw order never changes. "Skip to end" jumps to the end.
 *                 A new result starts over.
 * Depends on:     react, ./drawControl, ./types
 * Used by:        ./App
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useRef, useState } from 'react';

import {
  autoIntervalMs,
  firstStep,
  nextStep,
  windowPending,
  type DrawControl,
} from './drawControl.js';
import type { QuickTestResult } from './types.js';

export interface DrawTicker {
  readonly step: number;
  // Host mode: show the next draw now. Does nothing once the match is fully shown.
  readonly drawNext: () => void;
}

interface Playing {
  readonly result: QuickTestResult | null;
  readonly step: number;
}

export function useDrawTicker(result: QuickTestResult | null, control: DrawControl): DrawTicker {
  const [playing, setPlaying] = useState<Playing>({ result: null, step: 0 });
  // When the last draw was shown, and when timed draws were last (re)started.
  const clock = useRef({ drawnAt: Date.now(), resumedAt: Date.now() });
  // A new result restarts playback before its first draw.
  const current =
    playing.result === result
      ? playing
      : { result, step: result === null ? 0 : firstStep(result.events) };
  if (current !== playing) {
    clock.current = { drawnAt: Date.now(), resumedAt: Date.now() };
    setPlaying(current);
  }
  const { step } = current;
  const done = result === null || step >= result.events.length;
  const intervalMs = result === null ? 0 : autoIntervalMs(control, result);
  useEffect(() => {
    clock.current = { ...clock.current, resumedAt: Date.now() };
  }, [control.mode, intervalMs]);
  useEffect(() => {
    if (result === null || done) return undefined;
    if (control.skipped) {
      setPlaying({ result, step: result.events.length });
      return undefined;
    }
    const pending = windowPending(result.events, step);
    if (!pending && control.mode === 'host') return undefined;
    const { drawnAt, resumedAt } = clock.current;
    const due = pending
      ? drawnAt + result.speedWindowMs
      : Math.max(drawnAt, resumedAt) + intervalMs;
    const id = window.setTimeout(
      () => {
        if (!pending) clock.current = { ...clock.current, drawnAt: Date.now() };
        setPlaying({ result, step: nextStep(result.events, step) });
      },
      Math.max(0, due - Date.now()),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [result, step, done, control.skipped, control.mode, intervalMs]);
  const drawNext = (): void => {
    if (result === null) return;
    clock.current = { ...clock.current, drawnAt: Date.now() };
    // Functional update: two quick presses are two draws, never one. A window still open
    // closes first, so the press always shows exactly one new number.
    setPlaying((prev) => {
      if (prev.result !== result) return prev;
      const from = windowPending(result.events, prev.step)
        ? nextStep(result.events, prev.step)
        : prev.step;
      return { result, step: nextStep(result.events, from) };
    });
  };
  return { step, drawNext };
}
