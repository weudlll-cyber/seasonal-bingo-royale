/**
 * @file   apps/web/src/components/DrawTicker.tsx
 * @module web
 * @brief  The draws of the current round, newest highlighted (WP-08).
 *
 * Responsibility: render every draw of the round so far, numbers with their column
 *                 letter ("G 52", D7); classicSeasons symbols (101–104) show the original
 *                 season icon with its name. The newest draw is highlighted and fades in
 *                 unless the viewer prefers reduced motion; in the pause between rounds
 *                 none is highlighted, so the last number does not read as "tap now".
 *                 Where a screen caps the row's height (the player screen, ../game/arena.css)
 *                 it scrolls, and each new draw scrolls it to the newest; it is a named
 *                 region and a tab stop, so a keyboard can scroll it (WCAG 2.1.1). With
 *                 `last` only the newest so many show, the older ones hidden, and nothing
 *                 scrolls (the wide match screens, owner decision of 2026-11-28).
 * Depends on:     react, ./SeasonIcon, ../types, ../useReducedMotion
 * Used by:        ./Playback, ../game/MatchScreen, ../game/WideBall
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §7 (D21), §13
 */
import { useEffect, useRef, type ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import { ballLabel, seasonOfSymbol } from '../types.js';
import { useReducedMotion } from '../useReducedMotion.js';

interface DrawTickerProps {
  readonly draws: readonly number[];
  readonly speedWindowMs: number;
  // The speed-window line; hidden once the match is over.
  readonly showWindow?: boolean;
  // The pause between rounds: no draw is highlighted as the newest.
  readonly paused?: boolean;
  // Only the newest so many, in a row that does not scroll.
  readonly last?: number;
}

export function DrawTicker({
  draws,
  speedWindowMs,
  showWindow = true,
  paused = false,
  last,
}: DrawTickerProps): ReactElement {
  const reduced = useReducedMotion();
  const newest = paused ? -1 : draws.length - 1;
  const row = useScrolledToNewest(draws.length);
  const from = last === undefined ? 0 : Math.max(0, draws.length - last);
  return (
    <div>
      {showWindow ? (
        <p style={{ margin: '0 0 0.25rem', color: 'var(--sk-color-text-muted)' }}>
          Speed window: {String(speedWindowMs / 1000)} s after each draw
        </p>
      ) : null}
      {/* Scrolls where a screen caps its height: named and focusable (WCAG 2.1.1). */}
      <div
        ref={row}
        className="draw-ticker"
        data-testid="draw-ticker"
        role="region"
        aria-label="Drawn numbers"
        tabIndex={last === undefined ? 0 : undefined}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}
      >
        {draws.map((item, i) => (
          <Draw
            key={`${String(item)}-${String(i)}`}
            item={item}
            newest={i === newest}
            older={i < from}
            fades={!reduced}
          />
        ))}
      </div>
    </div>
  );
}

// One drawn number; the newest highlighted, fading in unless motion is reduced.
function Draw({
  item,
  newest,
  older,
  fades,
}: {
  readonly item: number;
  readonly newest: boolean;
  // Older than the newest so many: in the row, not shown.
  readonly older: boolean;
  readonly fades: boolean;
}): ReactElement {
  const season = seasonOfSymbol(item);
  return (
    <span
      hidden={older}
      data-testid={newest ? 'draw-newest' : undefined}
      data-item={item}
      className={newest && fades ? 'sbr-anim-fade' : undefined}
      style={{
        padding: '0.1rem 0.4rem',
        borderRadius: '0.25rem',
        // Theme tokens: the newest on Autumn, the others on the inset surface.
        background: newest ? 'var(--sk-color-autumn)' : 'var(--sk-color-surface-2)',
        color: newest ? 'var(--sk-color-on-season)' : 'var(--sk-color-text)',
        minWidth: '2rem',
        textAlign: 'center',
      }}
    >
      {/* A season draw shows its icon and its name, never a bare dot. */}
      {season === null ? (
        ballLabel(item)
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <SeasonIcon season={season} size="0.9rem" />
          {ballLabel(item)}
        </span>
      )}
    </span>
  );
}

// A capped row keeps the newest draw in view (its last line) after every new draw.
function useScrolledToNewest(count: number) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [count]);
  return row;
}
