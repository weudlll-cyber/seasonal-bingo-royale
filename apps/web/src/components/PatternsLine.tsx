/**
 * @file   apps/web/src/components/PatternsLine.tsx
 * @module web
 * @brief  The round's patterns in one line under the recap, where it fits (owner decision of
 *         2026-11-28).
 *
 * Responsibility: every pattern active in the round's stage with its points, in one line; shown
 *                 only where the whole line fits its column (else nothing: the round's panel
 *                 names them). Display only.
 * Depends on:     react, ../game/labels, ../playback (types), ../types
 * Used by:        ../game/WideArena
 * Spec:           docs/spec/01-game-design.md §8.1, §13; docs/concepts/fit-audit.md §12
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

import { prizeName } from '../game/labels.js';
import type { PlaybackView } from '../playback.js';
import type { QuickTestResult } from '../types.js';

export function PatternsLine({
  result,
  view,
}: {
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}): ReactElement | null {
  const keys = result.stagePlan[view.roundStage]?.activePatterns ?? [];
  const line = useRef<HTMLParagraphElement>(null);
  const [fits, setFits] = useState(true);
  // A new width: ask again.
  useEffect(() => {
    const again = (): void => {
      setFits(true);
    };
    window.addEventListener('resize', again);
    return () => {
      window.removeEventListener('resize', again);
    };
  }, []);
  useLayoutEffect(() => {
    const el = line.current;
    if (fits && el !== null && el.scrollWidth > el.clientWidth + 1) setFits(false);
  });
  if (keys.length === 0 || !fits) return null;
  const parts = keys.map(
    (key) => `${prizeName(key)} ${String(result.patternPoints[key] ?? 0)} pts`,
  );
  return (
    <p ref={line} className="patterns-line" data-testid="patterns-line">
      Patterns this round: {parts.join(' · ')}
    </p>
  );
}
