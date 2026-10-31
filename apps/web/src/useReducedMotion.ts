/**
 * @file   apps/web/src/useReducedMotion.ts
 * @module web
 * @brief  React hook: does the viewer prefer reduced motion? (01 §13)
 *
 * Responsibility: read `prefers-reduced-motion: reduce` and follow changes. Components
 *                 add their animation class only when this returns false; motion.css
 *                 also switches every animation off under the same media query.
 * Depends on:     react
 * Used by:        ./components/CutScreen, ./components/DrawTicker, ./components/OwnerCard,
 *                 ./components/Playback, ./game/CurrentBall, ./game/Interlude
 * Spec:           docs/spec/01-game-design.md §13
 */
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function prefersReduced(): boolean {
  // matchMedia is missing in some non-browser environments; animate by default there.
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReduced);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(QUERY);
    const onChange = (): void => {
      setReduced(media.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);
  return reduced;
}
