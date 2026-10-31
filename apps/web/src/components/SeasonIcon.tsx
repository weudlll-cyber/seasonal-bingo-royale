/**
 * @file   apps/web/src/components/SeasonIcon.tsx
 * @module web
 * @brief  One original season icon, optionally on its season colour (01 §13).
 *
 * Responsibility: render the delivered SVG for a season with an accessible name, so
 *                 colour is never the only carrier of meaning (WCAG, 01 §13).
 * Depends on:     react, ../seasonIcons, ../types
 * Used by:        ./CellFace, ./OwnerStatusPanel, ./DrawTicker, ./RankRow, ../game/CurrentBall,
 *                 ../game/InterludeCards
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { SEASON_ICON_URLS } from '../seasonIcons.js';
import { seasonColor, type Season } from '../types.js';

interface SeasonIconProps {
  readonly season: Season;
  readonly size?: string;
  readonly onColor?: boolean;
  readonly dimmed?: boolean;
  // A dark silhouette, for an icon placed on its own season colour (badges).
  readonly ink?: boolean;
}

export function SeasonIcon({
  season,
  size = '1rem',
  onColor = false,
  dimmed = false,
  ink = false,
}: SeasonIconProps): ReactElement {
  return (
    <img
      src={SEASON_ICON_URLS[season]}
      alt={season}
      data-season={season}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        borderRadius: '50%',
        background: onColor ? seasonColor(season) : 'transparent',
        opacity: dimmed ? 0.25 : 1,
        filter: ink ? 'brightness(0)' : undefined,
      }}
    />
  );
}
