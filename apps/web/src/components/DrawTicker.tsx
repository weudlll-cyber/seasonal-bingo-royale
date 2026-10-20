/**
 * @file   apps/web/src/components/DrawTicker.tsx
 * @module web
 * @brief  The draws of the current round, newest highlighted (WP-08).
 *
 * Responsibility: render every draw of the round so far; classicSeasons symbols (101–104)
 *                 show the original season icon on its colour. The newest draw fades in
 *                 unless the viewer prefers reduced motion.
 * Depends on:     react, ./SeasonIcon, ../types, ../useReducedMotion
 * Used by:        ./Playback
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import { seasonOfSymbol } from '../types.js';
import { useReducedMotion } from '../useReducedMotion.js';

export interface DrawTickerProps {
  readonly draws: readonly number[];
  readonly speedWindowMs: number;
}

export function DrawTicker({ draws, speedWindowMs }: DrawTickerProps): ReactElement {
  const reduced = useReducedMotion();
  const newest = draws.length - 1;
  return (
    <div>
      <p style={{ margin: '0 0 0.25rem', color: '#9aa5b2' }}>
        Speed window: {String(speedWindowMs / 1000)} s after each draw
      </p>
      <div data-testid="draw-ticker" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {draws.map((item, i) => {
          const season = seasonOfSymbol(item);
          return (
            <span
              key={`${String(item)}-${String(i)}`}
              data-testid={i === newest ? 'draw-newest' : undefined}
              className={i === newest && !reduced ? 'sbr-anim-fade' : undefined}
              style={{
                padding: '0.1rem 0.4rem',
                borderRadius: '0.25rem',
                background: i === newest ? '#f9a825' : '#1a2130',
                color: i === newest ? '#0f1115' : '#e7ecf3',
                minWidth: '2rem',
                textAlign: 'center',
              }}
            >
              {season === null ? String(item) : <SeasonIcon season={season} onColor />}
            </span>
          );
        })}
      </div>
    </div>
  );
}
