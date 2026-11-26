/**
 * @file   apps/web/src/components/SeasonIcon.tsx
 * @module web
 * @brief  One original season icon, optionally on its season colour, or its white disc with a ring (01 §13).
 *
 * Responsibility: one element per season, drawn by the kit's stylesheet (`.sk-season-icon`, the
 *                 website's four drawings, K83) and named, so colour is never the only carrier of
 *                 meaning (WCAG, 01 §13): "Spring" and so on, optionally on its season colour or as
 *                 a dark silhouette (the kit's one-colour form). A season not earned
 *                 (`earned={false}`) is a white disc with a grey ring of the same size, named
 *                 "<Season> (not collected)", never a faded icon. `SEASON_MARK_SIZE` is the one
 *                 size of a player's season marks on every screen (a kit token).
 * Depends on:     react, ../types, ./seasonMark.css; @seasonal/kit/seasons.css (../main)
 * Used by:        ./CellFace, ./OwnerStatusPanel, ./DrawTicker, ./SeasonSet, ../game/CurrentBall,
 *                 ../game/InterludeCards
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { seasonColor, type Season } from '../types.js';
import './seasonMark.css';

// One size for a player's season marks wherever they show (a kit type size, one step above 0.85rem).
export const SEASON_MARK_SIZE = 'var(--sk-font-size-body)';

const NAMES: Readonly<Record<Season, string>> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

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
        aria-label={`${NAMES[season]} (not collected)`}
        className="season-ring"
        data-season={season}
        data-earned="false"
        style={{
          width: size,
          height: size,
          // A white disc with the grey ring, on any ground and in both themes: --sk-color-on-live is the
          // kit's white that no theme overrides (--sk-color-surface and --sk-color-on-solid turn navy in dark).
          background: 'var(--sk-color-on-live)',
          borderColor: 'var(--sk-color-border-strong)',
        }}
      />
    );
  return (
    <span
      role="img"
      aria-label={NAMES[season]}
      className="sk-season-icon"
      data-sk-season={season}
      data-sk-mono={ink ? '' : undefined}
      data-season={season}
      data-earned="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        // The silhouette is the text colour filling the drawing's shape.
        ...(ink ? { color: 'var(--sk-color-on-season)' } : {}),
        ...(onColor && !ink ? { backgroundColor: seasonColor(season) } : {}),
      }}
    />
  );
}
