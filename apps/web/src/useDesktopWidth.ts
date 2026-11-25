/**
 * @file   apps/web/src/useDesktopWidth.ts
 * @module web
 * @brief  React hook: is the window as wide as a desktop layout (960 px, the app's phone breakpoint)?
 *
 * Responsibility: read `(min-width: 960px)` and follow changes, the same breakpoint the stylesheets
 *                 use for "phone" below it. Where matchMedia is missing (a non-browser test
 *                 environment) it answers true: the desktop is the default.
 * Depends on:     react
 * Used by:        ./game/SeasonsOverview
 * Spec:           docs/spec/01-game-design.md §13
 */
import { useEffect, useState } from 'react';

const QUERY = '(min-width: 960px)';

const isDesktop = (): boolean =>
  typeof window.matchMedia !== 'function' || window.matchMedia(QUERY).matches;

export function useDesktopWidth(): boolean {
  const [desktop, setDesktop] = useState(isDesktop);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(QUERY);
    const onChange = (): void => {
      setDesktop(media.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);
  return desktop;
}
