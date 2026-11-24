/**
 * @file   apps/web/src/useScrollHint.ts
 * @module web
 * @brief  Marks a scrolling box whose content continues below its bottom edge (./scrollHint.css).
 *
 * Responsibility: keeps `data-more` ("true" or "false") on a box that scrolls: true while some of
 *                 its content lies below the visible part, so ./scrollHint.css can draw "More
 *                 below" on it; false at the end or when nothing is cut. Follows scrolling, the
 *                 box's own size and the size of its direct children (rows arriving, a panel
 *                 growing). The box is given as a ref or as a selector for a box the kit renders
 *                 (the docked screen's game area). Test DOMs without ResizeObserver stay unmarked.
 * Depends on:     react, ./scrollHint.css
 * Used by:        ./shell/DockedChat, ./game/MatchScreen, ./components/Standings, ./host/HostConsole
 * Spec:           docs/concepts/fit-audit.md §8; docs/concepts/kit-adoption.md §8
 */
import { useEffect, type RefObject } from 'react';

import './scrollHint.css';

// Less than a pixel of rounding is not "more".
const hasMore = (box: HTMLElement): boolean =>
  box.scrollHeight - box.scrollTop - box.clientHeight > 1;

export function useScrollHint(target: RefObject<HTMLElement | null> | string): void {
  useEffect(() => {
    const box =
      typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target.current;
    if (box === null || typeof ResizeObserver === 'undefined') return undefined;
    const mark = (): void => {
      box.dataset['more'] = String(hasMore(box));
    };
    const watch = new ResizeObserver(mark);
    watch.observe(box);
    // The box's content changes size inside a box that keeps its own.
    for (const child of box.children) watch.observe(child);
    box.addEventListener('scroll', mark, { passive: true });
    mark();
    return () => {
      watch.disconnect();
      box.removeEventListener('scroll', mark);
      delete box.dataset['more'];
    };
  });
}
