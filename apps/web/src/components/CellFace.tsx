/**
 * @file   apps/web/src/components/CellFace.tsx
 * @module web
 * @brief  What one card cell shows and how it is coloured (01 §4, §3a, §13).
 *
 * Responsibility: shared by the owner's tappable card and the read-only cards. A
 *                 royale season cell shows its number with the season icon and a
 *                 season-coloured frame; a classicSeasons symbol cell shows the icon on
 *                 its season colour; the free centre shows a star.
 * Depends on:     react, ./SeasonIcon, ../types
 * Used by:        ./OwnerCard, ./CardGrid
 * Spec:           docs/spec/01-game-design.md §3a, §4, §13
 */
import type { CSSProperties, ReactElement } from 'react';

import { SeasonIcon } from './SeasonIcon.js';
import {
  ON_SEASON_COLOR,
  SEASON_COLORS,
  SEASON_NAMES,
  seasonOfSymbol,
  type Card,
  type Season,
} from '../types.js';

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
  const isSymbol = card.cells[index]?.kind === 'symbol';
  const isFree = card.cells[index]?.kind === 'free';
  const base = isFree ? '#2a3645' : '#1a2130';
  const background = isSymbol && season !== null ? SEASON_COLORS[season] : base;
  return {
    width: '2.6rem',
    height: '2.6rem',
    display: 'grid',
    placeItems: 'center',
    fontSize: '0.9rem',
    borderRadius: '0.25rem',
    border: season === null ? '2px solid transparent' : `2px solid ${SEASON_COLORS[season]}`,
    // Marked cells get a filled tone and a check outline, not only a colour change.
    background: marked ? '#e7ecf3' : background,
    color: marked || isSymbol ? ON_SEASON_COLOR : '#e7ecf3',
    boxShadow: marked ? 'inset 0 0 0 3px #04aaf7' : 'none',
    cursor: 'pointer',
    padding: 0,
  };
}
