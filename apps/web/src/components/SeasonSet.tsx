/**
 * @file   apps/web/src/components/SeasonSet.tsx
 * @module web
 * @brief  A player's four season marks, earned ones as icons, the others as white discs with a ring.
 *
 * Responsibility: the one set every screen uses where a player's seasons show (ranked rows,
 *                 standings, the podium): the four seasons in their fixed order at the one mark
 *                 size (./SeasonIcon), each earned or not, with the accessible label
 *                 "N of 4 seasons" (the marks name themselves). Extracted from ./RankRow.
 * Depends on:     react, ./SeasonIcon, ../types, ./seasonMark.css
 * Used by:        ./RankRow, ./Podium, ../game/InterludeCards
 * Spec:           docs/spec/01-game-design.md §7.5, §13
 */
import type { ReactElement } from 'react';

import { SEASON_MARK_SIZE, SeasonIcon } from './SeasonIcon.js';
import { SEASON_NAMES, type Season } from '../types.js';
import './seasonMark.css';

interface SeasonSetProps {
  readonly seasons: readonly Season[];
  // Extra class of the screen that places the set (a row's right edge, a podium step).
  readonly className?: string;
}

export function SeasonSet({ seasons, className }: SeasonSetProps): ReactElement {
  return (
    <span
      className={className === undefined ? 'season-set' : `season-set ${className}`}
      aria-label={`${String(seasons.length)} of 4 seasons`}
    >
      {SEASON_NAMES.map((s) => (
        <SeasonIcon
          key={s}
          season={s}
          size={SEASON_MARK_SIZE}
          onColor
          earned={seasons.includes(s)}
        />
      ))}
    </span>
  );
}
