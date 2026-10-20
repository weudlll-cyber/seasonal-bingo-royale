/**
 * @file   apps/web/src/useDrawTicker.ts
 * @module web
 * @brief  React hook that plays a Quick Test back one draw per tick (WP-08).
 *
 * Responsibility: own the playback step for one result: start before the first draw,
 *                 then after each pace interval reveal exactly one draw with its events
 *                 (./drawPace). `skip` jumps to the end. A new result starts over.
 * Depends on:     react, ./drawPace, ./types
 * Used by:        ./App
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useState } from 'react';

import { firstStep, nextStep, paceIntervalMs, type PaceLabel } from './drawPace.js';
import type { QuickTestResult } from './types.js';

export function useDrawTicker(result: QuickTestResult | null, pace: PaceLabel): number {
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
  useEffect(() => {
    if (result === null || step >= result.events.length) return undefined;
    if (pace === 'skip') {
      setPlaying({ result, step: result.events.length });
      return undefined;
    }
    // One timer per draw: the next draw shows one full interval after this one.
    const id = window.setTimeout(
      () => {
        setPlaying({ result, step: nextStep(result.events, step) });
      },
      paceIntervalMs(pace, result.drawIntervalMs),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [result, step, pace]);
  return step;
}
