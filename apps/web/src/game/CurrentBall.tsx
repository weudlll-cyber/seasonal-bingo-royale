/**
 * @file   apps/web/src/game/CurrentBall.tsx
 * @module web/game
 * @brief  The current number, large, with its letter ("G 52") or its season icon (D7).
 *
 * Responsibility: show the latest draw of the round as a ball that rolls in on every new
 *                 number (no animation under reduced motion), with a speed-window bar that
 *                 runs down from the moment the number appeared; before the first draw it
 *                 says so. Announced to screen readers.
 * Depends on:     react, ../components/SeasonIcon, ../types, ../useReducedMotion
 * Used by:        ./MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §5, §6, §13
 */
import { useEffect, useState, type ReactElement } from 'react';

import { SeasonIcon } from '../components/SeasonIcon.js';
import { ballLabel, seasonOfSymbol } from '../types.js';
import { useReducedMotion } from '../useReducedMotion.js';

export interface CurrentBallProps {
  readonly draws: readonly number[];
  readonly speedWindowMs: number;
  readonly roundOver: boolean;
  // The match is over: the note says so instead of "Round over".
  readonly finished?: boolean;
}

export function CurrentBall(props: CurrentBallProps): ReactElement {
  const { draws, speedWindowMs, roundOver, finished = false } = props;
  const reduced = useReducedMotion();
  const item = draws.at(-1);
  const [shownAt, setShownAt] = useState(() => Date.now());
  useEffect(() => {
    setShownAt(Date.now());
  }, [item, draws.length]);
  if (item === undefined) {
    return (
      <div className="ball ball--empty" data-testid="current-ball" aria-live="polite">
        Waiting for the first number
      </div>
    );
  }
  const season = seasonOfSymbol(item);
  const [letter, number] = season === null ? ballLabel(item).split(' ') : [null, null];
  return (
    <div className="ball-wrap" aria-live="polite">
      <div
        key={draws.length}
        className={reduced ? 'ball' : 'ball sbr-anim-draw'}
        data-testid="current-ball"
        data-item={item}
        aria-label={ballLabel(item)}
      >
        {season === null ? (
          <>
            <span className="ball-letter">{letter}</span>
            <span className="ball-number">{number}</span>
          </>
        ) : (
          <SeasonIcon season={season} size="60%" />
        )}
      </div>
      {roundOver ? (
        <p className="sbr-muted ball-note">{finished ? 'Match over' : 'Round over'}</p>
      ) : (
        <WindowBar key={`${String(draws.length)}-${String(shownAt)}`} ms={speedWindowMs} />
      )}
    </div>
  );
}

// The speed window as a bar that empties over its length; no animation means a static bar.
function WindowBar({ ms }: { readonly ms: number }): ReactElement {
  return (
    <div className="window-bar" role="presentation">
      <span style={{ animationDuration: `${String(ms)}ms` }} />
    </div>
  );
}
