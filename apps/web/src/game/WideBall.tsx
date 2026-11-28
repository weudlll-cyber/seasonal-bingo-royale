/**
 * @file   apps/web/src/game/WideBall.tsx
 * @module web/game
 * @brief  The current number and the newest drawn numbers in a wide screen's left column.
 *
 * Responsibility: the ball with its speed-window bar and below it the newest drawn numbers,
 *                 as many as asked for, in a row that does not scroll (owner decision of
 *                 2026-11-28); for a player still in also the "Speed window" line. A viewer
 *                 who cannot tap sees neither the bar nor the line. Display only.
 * Depends on:     react, ../components/DrawTicker, ./CurrentBall, ./useLiveMatch (types),
 *                 ../playback (types)
 * Used by:        ./WideArena, ../host/WideConsole
 * Spec:           docs/spec/01-game-design.md §6, §13; docs/concepts/fit-audit.md §12
 */
import type { ReactElement } from 'react';

import { DrawTicker } from '../components/DrawTicker.js';
import type { PlaybackView } from '../playback.js';
import { CurrentBall } from './CurrentBall.js';
import type { LiveState } from './useLiveMatch.js';

export function WideBall({
  result,
  view,
  tapping,
  last,
}: {
  readonly result: LiveState['view'];
  readonly view: PlaybackView;
  // The viewer taps their own card.
  readonly tapping: boolean;
  // How many of the newest drawn numbers show.
  readonly last: number;
}): ReactElement {
  return (
    <>
      <div className="arena-ball">
        <CurrentBall
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          showWindow={tapping}
          roundOver={view.roundOver}
          finished={view.finished}
        />
      </div>
      <div className="arena-ticker">
        <DrawTicker
          draws={view.drawsSoFar}
          speedWindowMs={result.speedWindowMs}
          showWindow={tapping}
          paused={view.roundOver}
          last={last}
        />
      </div>
    </>
  );
}
