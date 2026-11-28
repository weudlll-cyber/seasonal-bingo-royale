/**
 * @file   apps/web/src/game/HostLink.tsx
 * @module web/game
 * @brief  The way to the host console for the match's host on the player-side screens.
 *
 * Responsibility: when the server says the signed-in account hosts this match (`youHost`),
 *                 show a clear link that opens the host console in a new tab (D25), so a host
 *                 who plays along keeps the player screen; for everyone else nothing. Stacked
 *                 screens say "Open host console" on a primary button; the wide screens' head
 *                 row says "Host console" on a secondary one (owner decision of 2026-11-28).
 * Depends on:     react, ../shell/router, ./useLiveMatch (types)
 * Used by:        ./MatchScreen (the arena; not the waiting room), ./WideArena
 * Spec:           docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import type { MatchSummary } from './useLiveMatch.js';

export function HostLink({
  match,
  short = false,
}: {
  readonly match: MatchSummary;
  readonly short?: boolean;
}): ReactElement | null {
  if (match.youHost !== true) return null;
  return (
    <a
      className={short ? 'sk-btn' : 'sk-btn sk-btn--primary'}
      href={hrefOf({ name: 'host', code: match.code })}
      // D25: the console in a new tab; the player screen stays where it is.
      target="_blank"
      rel="noopener"
      data-testid="open-host-console"
    >
      {short ? 'Host console' : 'Open host console'}
    </a>
  );
}
