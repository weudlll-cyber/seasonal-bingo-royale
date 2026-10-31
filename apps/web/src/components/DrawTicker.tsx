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
 * Depends on:     react, ./SeasonIcon, ../types, ../useReducedMotion
 * Used by:        ./Playback, ../game/MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §7 (D21), §13
 */
import type { ReactElement } from 'react';

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
}

export function DrawTicker({
  draws,
  speedWindowMs,
  showWindow = true,
  paused = false,
}: DrawTickerProps): ReactElement {
  const reduced = useReducedMotion();
  const newest = paused ? -1 : draws.length - 1;
  return (
    <div>
      {showWindow ? (
        <p style={{ margin: '0 0 0.25rem', color: 'var(--color-text-muted)' }}>
          Speed window: {String(speedWindowMs / 1000)} s after each draw
        </p>
      ) : null}
      <div data-testid="draw-ticker" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {draws.map((item, i) => {
          const season = seasonOfSymbol(item);
          return (
            <span
              key={`${String(item)}-${String(i)}`}
              data-testid={i === newest ? 'draw-newest' : undefined}
              data-item={item}
              className={i === newest && !reduced ? 'sbr-anim-fade' : undefined}
              style={{
                padding: '0.1rem 0.4rem',
                borderRadius: '0.25rem',
                // Theme tokens: the newest on Autumn, the others on the inset surface.
                background: i === newest ? 'var(--color-autumn)' : 'var(--color-surface-2)',
                color: i === newest ? 'var(--color-on-season)' : 'var(--color-text)',
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
        })}
      </div>
    </div>
  );
}
