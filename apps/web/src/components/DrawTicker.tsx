/**
 * @file   apps/web/src/components/DrawTicker.tsx
 * @module web
 * @brief  Horizontal ticker of the drawn items so far (WP-08).
 *
 * Responsibility: render every draw up to the current step; season symbols (ids
 *                 101–104) render as season emoji so classicSeasons draws stand out.
 * Depends on:     react, ../types
 * Used by:        ../App
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import type { ReactElement } from 'react';

import { SEASON_SYMBOLS } from '../types.js';

export interface DrawTickerProps {
  readonly draws: readonly number[];
  readonly stepIndex: number;
}

export function DrawTicker({ draws, stepIndex }: DrawTickerProps): ReactElement {
  const visible = draws.slice(0, stepIndex + 1);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {visible.map((item, i) => (
        <span
          key={`${String(item)}-${String(i)}`}
          style={{
            padding: '0.1rem 0.4rem',
            borderRadius: '0.25rem',
            background: i === stepIndex ? '#f9a825' : '#1a2130',
            color: i === stepIndex ? '#0f1115' : '#e7ecf3',
            minWidth: '2rem',
            textAlign: 'center',
          }}
        >
          {item >= 101 ? (SEASON_SYMBOLS[item] ?? '?') : String(item)}
        </span>
      ))}
    </div>
  );
}
