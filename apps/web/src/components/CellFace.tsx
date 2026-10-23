/**
 * @file   apps/web/src/components/CellFace.tsx
 * @module web
 * @brief  What one card cell shows and how it is coloured (01 §4, §3a, §13).
 *
 * Responsibility: shared by the owner's tappable card and the read-only cards. A
 *                 royale season cell shows its number with the season icon and a
 *                 season-coloured frame; a classicSeasons symbol cell shows its icon on the
 *                 card colour, framed in its season colour; the free centre shows a star.
 *                 Colours come from the live card's --cell-* values, else the theme tokens.
 * Depends on:     react, ./SeasonIcon, ../types
 * Used by:        ./OwnerCard, ./CardGrid
 * Spec:           docs/spec/01-game-design.md §3a, §4, §13
 */
import type { CSSProperties, ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import { SEASON_NAMES, seasonColor, seasonOfSymbol, type Card, type Season } from '../types.js';

export function seasonOfCell(card: Card, index: number): Season | null {
  const cell = card.cells[index];
  if (cell?.kind === 'symbol') return seasonOfSymbol(cell.value);
  const position = card.seasonCells?.indexOf(index) ?? -1;
  return SEASON_NAMES[position] ?? null;
}

export function CellFace({ card, index }: { card: Card; index: number }): ReactElement {
  const cell = card.cells[index];
  const season = seasonOfCell(card, index);
  if (cell === undefined || cell.kind === 'free') return <span aria-label="free">★</span>;
  if (cell.kind === 'symbol' && season !== null)
    return <SeasonIcon season={season} size="1.6rem" />;
  return (
    <span style={{ display: 'grid', placeItems: 'center', lineHeight: 1 }}>
      {cell.kind === 'number' ? String(cell.value) : '?'}
      {season !== null ? <SeasonIcon season={season} size="0.8rem" /> : null}
    </span>
  );
}

export function cellBoxStyle(card: Card, index: number, marked: boolean): CSSProperties {
  const season = seasonOfCell(card, index);
  const isFree = card.cells[index]?.kind === 'free';
  // CSS variables with the Quick Test's values as fallbacks: the live card sets them to
  // the design tokens (the card as the hero element, packages/ui).
  const base = isFree
    ? 'var(--cell-free-bg, var(--color-border-strong))'
    : 'var(--cell-bg, var(--color-surface-2))';
  const background = base;
  return {
    width: 'var(--cell-size, 2.6rem)',
    height: 'var(--cell-size, 2.6rem)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 'var(--cell-font, 0.9rem)',
    fontWeight: 'var(--cell-weight, 400)',
    borderRadius: 'var(--cell-radius, 0.25rem)',
    border: season === null ? '2px solid transparent' : `2px solid ${seasonColor(season)}`,
    // Marked cells get a filled tone and a check outline, not only a colour change.
    background: marked ? 'var(--cell-marked-bg, var(--color-solid))' : background,
    // The live card sets --cell-*; the Quick Test's cards fall back to the theme tokens.
    color: marked
      ? 'var(--cell-marked-ink, var(--color-on-solid))'
      : 'var(--cell-ink, var(--color-text))',
    boxShadow: marked ? 'inset 0 0 0 3px var(--cell-marked-ring, var(--color-accent))' : 'none',
    cursor: 'pointer',
    padding: 0,
  };
}
