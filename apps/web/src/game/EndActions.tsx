/**
 * @file   apps/web/src/game/EndActions.tsx
 * @module web/game
 * @brief  What to do once a match is over: back to the lobby, or host another match.
 *
 * Responsibility: under the final placement, a player gets "Back to the lobby"; the host
 *                 also gets "Host another match". Links only, through the router.
 * Depends on:     react, ../shell/router
 * Used by:        ./MatchScreen, ../host/HostConsole, ./MatchCancelled
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';

export function EndActions({ host }: { readonly host: boolean }): ReactElement {
  return (
    <nav className="sbr-row" aria-label="After the match" data-testid="end-actions">
      {host ? (
        <a className="sbr-btn sbr-btn--primary" href={hrefOf({ name: 'hostNew' })}>
          Host another match
        </a>
      ) : null}
      <a className={host ? 'sbr-btn' : 'sbr-btn sbr-btn--primary'} href={hrefOf({ name: 'lobby' })}>
        Back to the lobby
      </a>
    </nav>
  );
}
