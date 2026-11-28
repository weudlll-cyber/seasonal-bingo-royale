/**
 * @file   apps/web/src/game/MatchHead.tsx
 * @module web/game
 * @brief  The one head row of a match screen on a wide page (owner decision of 2026-11-28).
 *
 * Responsibility: the title, LIVE (or "In progress") right after it, the progress text, between
 *                 rounds "Waiting for the host to start round N" or "Next round in N s", and at
 *                 the right the match's rules behind a small link and the screen's own actions
 *                 (the player's "Host console"). Where the row cannot hold it, the waiting or
 *                 countdown text goes to a second line under the title. Display only.
 * Depends on:     react, ../playback (types), ../shell/session (useServerCountdown), ./labels,
 *                 ./useLiveMatch (types)
 * Used by:        ./WideArena, ../host/WideConsole
 * Spec:           docs/spec/01-game-design.md §13; docs/concepts/fit-audit.md §12
 */
import type { ReactElement, ReactNode } from 'react';

import type { PlaybackView } from '../playback.js';
import { useServerCountdown } from '../shell/session.js';
import { nextRoundLine, rulesLine, runningBadge } from './labels.js';
import type { LiveState } from './useLiveMatch.js';

interface MatchHeadProps {
  readonly live: LiveState;
  readonly view: PlaybackView;
  // The progress text, in the screen's own words.
  readonly progress: ReactNode;
  // The rules line in the screen's own words; the match's by default.
  readonly rules?: string;
  readonly actions?: ReactNode;
}

export function MatchHead(props: MatchHeadProps): ReactElement {
  const { live, view, progress, actions } = props;
  return (
    <header className="match-head">
      <div className="match-head__text">
        <h1>{live.match.title}</h1>
        {live.match.status === 'running' ? (
          <span className="sk-badge-live">{runningBadge(live.match.mode)}</span>
        ) : null}
        <p className="sbr-muted">{progress}</p>
        <PauseLine live={live} view={view} />
      </div>
      <div className="match-head__actions">
        <details className="rules-info">
          <summary>Match rules</summary>
          <p>{props.rules ?? rulesLine(live.match)}</p>
        </details>
        {actions}
      </div>
    </header>
  );
}

// Between rounds: waiting for the host (D14), or the countdown of a timed pause.
function PauseLine({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement | null {
  const timed = view.roundOver && !view.finished ? live.match.nextRoundAt : null;
  const left = useServerCountdown(timed);
  if (view.finished) return null;
  if (live.match.waitingForHost) {
    return (
      <p className="match-head__pause" role="status" data-testid="waiting-for-host">
        Waiting for the host to start round {view.currentRound + 2}
      </p>
    );
  }
  if (left === null || left === 0) return null;
  return (
    <p className="match-head__pause" data-testid="interlude-countdown">
      {nextRoundLine(left)}
    </p>
  );
}
