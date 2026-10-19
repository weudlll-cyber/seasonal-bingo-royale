/**
 * @file   apps/web/src/components/CardGrid.tsx
 * @module web
 * @brief  5×5 card renderer with per-cell mark state (WP-08).
 *
 * Responsibility: lay out a player's card: number cells show their value, symbol cells
 *                 show the season emoji, the free centre is highlighted. A marked cell
 *                 gets a filled background so the owner can see pattern progress.
 * Depends on:     react, ../types
 * Used by:        ../App
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §4, §3a
 */
import type { ReactElement } from 'react';

import type { Cell } from '../types.js';
import { SEASON_SYMBOLS } from '../types.js';

export interface CardGridProps {
  readonly accountId: string;
  readonly cells: readonly Cell[];
  readonly marks: readonly boolean[];
}

export function CardGrid({ accountId, cells, marks }: CardGridProps): ReactElement {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <strong>{accountId}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 2.5rem)', gap: '2px' }}>
        {cells.map((cell, i) => (
          <CellBox key={i} cell={cell} marked={marks[i] ?? false} />
        ))}
      </div>
    </div>
  );
}

function CellBox({ cell, marked }: { cell: Cell; marked: boolean }): ReactElement {
  const bg = marked ? '#04aaf7' : cell.kind === 'free' ? '#2a3645' : '#1a2130';
  const content =
    cell.kind === 'number'
      ? String(cell.value)
      : cell.kind === 'symbol'
        ? (SEASON_SYMBOLS[cell.value] ?? '?')
        : '★';
  return (
    <div
      style={{
        width: '2.5rem',
        height: '2.5rem',
        display: 'grid',
        placeItems: 'center',
        background: bg,
        color: marked ? '#0f1115' : '#e7ecf3',
        fontSize: '0.9rem',
        borderRadius: '0.25rem',
      }}
    >
      {content}
    </div>
  );
}
