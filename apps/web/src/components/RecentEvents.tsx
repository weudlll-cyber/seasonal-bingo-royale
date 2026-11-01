/**
 * @file   apps/web/src/components/RecentEvents.tsx
 * @module web
 * @brief  The newest 3 event lines below the drawn numbers, the whole match log one click away.
 *
 * Responsibility: the 3 newest lines of the match (patterns, seasons, Season Complete, shield
 *                 saves, cuts …), newest first, always in view, the newest fading in; below them
 *                 the whole match log (newest first) in a closed disclosure that scrolls inside
 *                 itself when opened, so it never pushes the page. Hidden while there is no line
 *                 yet (01 §13).
 * Depends on:     react, ../playback, ../useReducedMotion, ./matchSide.css
 * Used by:        ../game/MatchScreen, ../host/HostConsole, ./Playback
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import type { Banner } from '../playback.js';
import { useReducedMotion } from '../useReducedMotion.js';
import './matchSide.css';

const SHOWN = 3;

export function RecentEvents({
  banners,
}: {
  readonly banners: readonly Banner[];
}): ReactElement | null {
  const reduced = useReducedMotion();
  if (banners.length === 0) return null;
  const newest = [...banners].reverse();
  return (
    <section className="recent-events" aria-label="Latest in the match">
      <ol data-testid="recent-events" aria-live="polite">
        {newest.slice(0, SHOWN).map((b, i) => (
          // The newest line fades in, unless the viewer prefers reduced motion (01 §13).
          <li key={b.key} className={i === 0 && !reduced ? 'sbr-anim-fade' : undefined}>
            {b.text}
          </li>
        ))}
      </ol>
      <details className="match-log">
        <summary>Whole match log ({String(banners.length)})</summary>
        <ol data-testid="match-log">
          {newest.map((b) => (
            <li key={b.key}>{b.text}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
