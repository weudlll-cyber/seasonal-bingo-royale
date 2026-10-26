/**
 * @file   apps/web/src/game/EndActions.tsx
 * @module web/game
 * @brief  What to do once a match is over: verify it, back to the lobby, or host another match.
 *
 * Responsibility: under the final placement or the cancelled page: "Verify this match"
 *                 (the revealed seed, 01 §9) and "Back to the lobby" for everyone; the host
 *                 also gets "Host another match". Links only, through the router.
 * Depends on:     react, ../shell/router
 * Used by:        ./MatchScreen, ../host/HostConsole, ./MatchCancelled
 * Spec:           docs/spec/01-game-design.md §13, §9
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';

export function EndActions({
  host,
  code,
}: {
  readonly host: boolean;
  readonly code: string;
}): ReactElement {
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
      <a className="sbr-btn" href={hrefOf({ name: 'verify', code })} data-testid="verify-link">
        Verify this match
      </a>
    </nav>
  );
}
