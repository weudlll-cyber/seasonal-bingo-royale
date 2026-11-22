/**
 * @file   apps/web/src/shell/useBarFold.ts
 * @module web/shell
 * @brief  Whether the top bar folds its items into the menu button: whenever they do not fit.
 *
 * Responsibility: the bar takes one row at every width (fit audit O1): below 960 px it starts
 *                 folded; wider, the items show in the bar, and when they would take a second
 *                 row (an item starts below another's bottom) the bar folds before the browser
 *                 paints and remembers the width it folded at. It tries one row again when the
 *                 window grows past that width, and whenever the items change (a new route,
 *                 another sign-in), and checks again when the window or the bar changes size (a
 *                 larger font). The bar carries the answer as data-folded (./menu.css).
 * Depends on:     react
 * Used by:        ./MenuFold
 * Spec:           docs/concepts/fit-audit.md §5 item 7 (O1); owner's fault list of 2026-11-21 (a)
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

// Narrower than this the bar is always folded (phones, small tablets).
const ALWAYS_FOLDED = 960;

// True when an item of the bar starts below another item's bottom (a second row).
function wraps(bar: Element): boolean {
  const items = [...bar.children, ...(bar.querySelector('.shell-menu')?.children ?? [])]
    .filter((e) => getComputedStyle(e).display !== 'contents')
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.height > 0);
  const firstBottom = Math.min(...items.map((r) => r.bottom));
  return items.some((r) => r.top >= firstBottom - 1);
}

// `inside`: an element in the bar; `items`: changes when the bar's items may change.
export function useBarFold(inside: RefObject<HTMLElement | null>, items: string): boolean {
  const [folded, setFolded] = useState(() => window.innerWidth < ALWAYS_FOLDED);
  const foldedAt = useRef(0);
  // New items: try one row again (wide enough).
  useLayoutEffect(() => {
    if (window.innerWidth >= ALWAYS_FOLDED) setFolded(false);
  }, [items]);
  // Before the browser paints: one row or fold.
  useLayoutEffect(() => {
    const bar = inside.current?.parentElement;
    if (bar === null || bar === undefined) return;
    bar.dataset['folded'] = String(folded);
    if (!folded && wraps(bar)) {
      foldedAt.current = window.innerWidth;
      setFolded(true);
    }
  });
  // A wider or narrower window, or a bar that changed size (a larger font): check again;
  // fold below 960 px, unfold once wider than the width it folded at.
  const [, recheck] = useState(0);
  useEffect(() => {
    const resized = (): void => {
      const w = window.innerWidth;
      if (w < ALWAYS_FOLDED) setFolded(true);
      else if (w > foldedAt.current) setFolded(false);
      recheck((n) => n + 1);
    };
    window.addEventListener('resize', resized);
    const bar = inside.current?.parentElement;
    const observer =
      typeof ResizeObserver === 'undefined' || bar === null || bar === undefined
        ? null
        : new ResizeObserver(() => {
            recheck((n) => n + 1);
          });
    if (observer !== null && bar !== null && bar !== undefined) observer.observe(bar);
    return () => {
      window.removeEventListener('resize', resized);
      observer?.disconnect();
    };
  }, [inside]);
  return folded;
}
