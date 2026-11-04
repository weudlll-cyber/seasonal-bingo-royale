/**
 * @file   apps/web/src/game/liveView.ts
 * @module web/game
 * @brief  What a watching screen asks of the state fetch (D24): the player it follows, the cards it holds.
 *
 * Responsibility: the query a watching screen adds to its state fetch: the player it follows
 *                 and, for the current round, the players whose cards it holds already. How an
 *                 answer and the live frames go into the held view is the protocol's own rule
 *                 (@sbr/contracts liveHeld: mergeAnswer, applyStep). Display only.
 * Depends on:     @sbr/contracts (lastRoundStart), ./liveTypes
 * Used by:        ./useLiveMatch
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/05-api-design.md §2.3
 */
import { lastRoundStart } from '@sbr/contracts';

import type { LiveState } from './liveTypes.js';

export function watchParams(held: LiveState | null, follow: string | null): string {
  if (held?.view.watch === undefined) return '';
  const start = lastRoundStart(held.view.events);
  const known =
    start === undefined
      ? ''
      : `&known=${String(start.roundIndex)}:${Object.keys(start.cardsByPlayer).map(encodeURIComponent).join(',')}`;
  return `${follow === null ? '' : `&follow=${encodeURIComponent(follow)}`}${known}`;
}
