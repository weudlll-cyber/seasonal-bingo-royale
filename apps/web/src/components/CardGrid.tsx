/**
 * @file   apps/web/src/components/CardGrid.tsx
 * @module web
 * @brief  Read-only 5×5 card with per-cell mark state (WP-08).
 *
 * Responsibility: lay out a card under its B I N G O letters with season cells and
 *                 marks as the server reported them; used for bot cards when the owner plays without a card,
 *                 and for the cards a player out or a spectator watches (D24), with a heading of
 *                 their own and the cell size of the surrounding card look (--cell-size).
 * Depends on:     react, ./BingoHeader, ./CellFace, ../types
 * Used by:        ./OwnerArea, ../game/WatchCards
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §4, §3a
 */
import type { ReactElement, ReactNode } from 'react';

import { BingoHeader } from './BingoHeader.js';
import { CellFace, cellBoxStyle } from './CellFace.js';
import type { Card } from '../types.js';

interface CardGridProps {
  readonly accountId: string;
  readonly card: Card;
  readonly marks: readonly boolean[];
  // Shown above the grid instead of the name.
  readonly heading?: ReactNode;
}

export function CardGrid({ accountId, card, marks, heading }: CardGridProps): ReactElement {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      {heading ?? <strong>{accountId}</strong>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, var(--cell-size, 2.6rem))',
          gap: '2px',
        }}
      >
        <BingoHeader />
        {card.cells.map((_cell, i) => (
          <div
            key={i}
            data-marked={marks[i] === true}
            style={cellBoxStyle(card, i, marks[i] ?? false)}
          >
            <CellFace card={card} index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}
