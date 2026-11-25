/**
 * @file   apps/web/src/game/SeasonsOverview.tsx
 * @module web/game
 * @brief  "What the seasons do": the four seasons and their effects before a royale starts.
 *
 * Responsibility: in the waiting room of a royale match, one line per season with its icon and name
 *                 and what it does once collected, from the match's frozen ruleset (the client
 *                 view's `seasonEffects`, the numbers the match will use), in the sentences of
 *                 ./seasonText (`seasonOverviewLine`, built on the status panel's), and that
 *                 collecting all four gives the Season Complete bonus (`seasonCompleteNote`).
 *                 Royale only: in the other game types the seasons have no effect, so nothing is
 *                 shown. It is a disclosure, open on a desktop and closed on a phone, so it never
 *                 pushes the Join button out of view there; a desktop shows it in a column beside
 *                 the players and Join (owner decision of 2026-11-25).
 * Depends on:     react, ../components/SeasonIcon, ../types, ../useDesktopWidth,
 *                 ./liveTypes, ./seasonText, ./seasonsOverview.css
 * Used by:        ./WaitingRoom
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3, §13
 */
import type { ReactElement } from 'react';

import { SEASON_MARK_SIZE, SeasonIcon } from '../components/SeasonIcon.js';
import { SEASON_NAMES } from '../types.js';
import { useDesktopWidth } from '../useDesktopWidth.js';
import type { LiveState } from './liveTypes.js';
import { seasonCompleteNote, seasonOverviewLine } from './seasonText.js';
import './seasonsOverview.css';

export function SeasonsOverview({
  result,
}: {
  readonly result: LiveState['view'];
}): ReactElement | null {
  const desktop = useDesktopWidth();
  if (result.gameType !== 'royale') return null;
  return (
    // `open` follows the width when it changes; a viewer's own toggle stays until then.
    <details className="seasons-overview" open={desktop} data-testid="seasons-overview">
      <summary>What the seasons do</summary>
      <ul>
        {SEASON_NAMES.map((season) => (
          <li key={season} data-testid={`season-overview-${season}`}>
            <SeasonIcon season={season} size={SEASON_MARK_SIZE} onColor />
            <span>{seasonOverviewLine(season, result.seasonEffects[season])}</span>
          </li>
        ))}
      </ul>
      <p data-testid="season-overview-complete">
        Collect them all: {seasonCompleteNote(result.seasonCompletePoints)}
      </p>
    </details>
  );
}
