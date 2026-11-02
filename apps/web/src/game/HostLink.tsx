/**
 * @file   apps/web/src/game/HostLink.tsx
 * @module web/game
 * @brief  "Open host console" for the match's host on the player-side screens.
 *
 * Responsibility: when the server says the signed-in account hosts this match (`youHost`),
 *                 show a clear link that opens the host console in a new tab (D25), so a host
 *                 who plays along keeps the player screen; for everyone else nothing.
 * Depends on:     react, ../shell/router, ./useLiveMatch (types)
 * Used by:        ./MatchScreen (the arena; not the waiting room)
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import type { MatchSummary } from './useLiveMatch.js';

export function HostLink({ match }: { readonly match: MatchSummary }): ReactElement | null {
  if (match.youHost !== true) return null;
  return (
    <a
      className="sbr-btn sbr-btn--primary"
      href={hrefOf({ name: 'host', code: match.code })}
      // D25: the console in a new tab; the player screen stays where it is.
      target="_blank"
      rel="noopener"
      data-testid="open-host-console"
    >
      Open host console
    </a>
  );
}
