/**
 * @file   apps/web/src/components/BingoHeader.tsx
 * @module web
 * @brief  The B I N G O letters above a card's five columns (01 §4, D7).
 *
 * Responsibility: five header cells, rendered as the first row of a card grid so each
 *                 letter sits above its column. Not focusable; purely a label row.
 * Depends on:     react, ../types
 * Used by:        ./CardGrid, ./OwnerCard
 * Spec:           docs/spec/01-game-design.md §4, §13
 */
import type { ReactElement } from 'react';

import { BINGO_LETTERS } from '../types.js';

export function BingoHeader(): ReactElement {
  return (
    <>
      {BINGO_LETTERS.map((letter) => (
        <span
          key={letter}
          data-testid="bingo-letter"
          aria-hidden="true"
          style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)' }}
        >
          {letter}
        </span>
      ))}
    </>
  );
}
