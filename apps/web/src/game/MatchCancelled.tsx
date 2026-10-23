/**
 * @file   apps/web/src/game/MatchCancelled.tsx
 * @module web/game
 * @brief  The end page of a match ended without a result, for host and players (D17).
 *
 * Responsibility: instead of the arena (never "Waiting for the first number" or empty
 *                 standings for an ended match): the title, "This match was cancelled by the
 *                 host." or "… by the system." and the reason in the host's or the system's
 *                 words, from the match's `matchAborted` event (events logged before D17
 *                 carry no `by`; they were the host's); then "Back to the lobby" for everyone
 *                 and "Host another match" for the host (./EndActions).
 * Depends on:     react, ./EndActions, ./useLiveMatch (types), ../types
 * Used by:        ./MatchScreen, ../host/HostConsole
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import type { DomainEventLike } from '../types.js';
import { EndActions } from './EndActions.js';
import type { LiveState } from './useLiveMatch.js';

type Aborted = Extract<DomainEventLike, { type: 'matchAborted' }>;

// `titled`: false under the console's own header.
export function MatchCancelled({
  live,
  titled = true,
}: {
  readonly live: LiveState;
  readonly titled?: boolean;
}): ReactElement {
  const ended = live.view.events.find((e): e is Aborted => e.type === 'matchAborted');
  const by = ended?.by === 'system' ? 'the system' : 'the host';
  return (
    <section className="sbr-panel sbr-stack" data-testid="match-cancelled">
      {titled ? <h1>{live.match.title}</h1> : null}
      {/* One paragraph: who ended it, then the reason on the next line. */}
      <p>
        <span data-testid="cancelled-by">This match was cancelled by {by}.</span>
        {ended !== undefined ? (
          <>
            <br />
            <span data-testid="cancelled-reason">Reason: {ended.reason}</span>
          </>
        ) : null}
      </p>
      <EndActions host={live.match.youHost === true} />
    </section>
  );
}
