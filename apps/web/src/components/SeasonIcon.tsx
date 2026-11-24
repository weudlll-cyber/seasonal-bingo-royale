/**
 * @file   apps/web/src/components/SeasonIcon.tsx
 * @module web
 * @brief  One original season icon, optionally on its season colour, or its empty ring (01 §13).
 *
 * Responsibility: render the delivered SVG for a season with an accessible name, so
 *                 colour is never the only carrier of meaning (WCAG, 01 §13). A season not
 *                 earned (`earned={false}`) is an empty grey ring of the same size with the
 *                 name "<season> (not collected)", never a faded icon. `SEASON_MARK_SIZE` is the one
 *                 size of a player's season marks on every screen (a kit token).
 * Depends on:     react, ../seasonIcons, ../types, ./seasonMark.css
 * Used by:        ./CellFace, ./OwnerStatusPanel, ./DrawTicker, ./SeasonSet, ../game/CurrentBall,
 *                 ../game/InterludeCards
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { SEASON_ICON_URLS } from '../seasonIcons.js';
import { seasonColor, type Season } from '../types.js';
import './seasonMark.css';

// One size for a player's season marks wherever they show (a kit type size, one step above 0.85rem).
export const SEASON_MARK_SIZE = 'var(--font-size-body)';

interface SeasonIconProps {
  readonly season: Season;
  readonly size?: string;
  readonly onColor?: boolean;
  // False: an empty grey ring instead of the icon (a season not collected).
  readonly earned?: boolean;
  // A dark silhouette, for an icon placed on its own season colour (badges).
  readonly ink?: boolean;
}

export function SeasonIcon({
  season,
  size = '1rem',
  onColor = false,
  earned = true,
  ink = false,
}: SeasonIconProps): ReactElement {
  if (!earned)
    return (
      <span
        role="img"
        aria-label={`${season} (not collected)`}
        className="season-ring"
        data-season={season}
        data-earned="false"
        style={{ width: size, height: size }}
      />
    );
  return (
    <img
      src={SEASON_ICON_URLS[season]}
      alt={season}
      data-season={season}
      data-earned="true"
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: '50%',
        background: onColor ? seasonColor(season) : 'transparent',
        filter: ink ? 'brightness(0)' : undefined,
      }}
    />
  );
}
