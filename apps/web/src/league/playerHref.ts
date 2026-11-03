/**
 * @file   apps/web/src/league/playerHref.ts
 * @module web/league
 * @brief  The profile link of a name shown in a live match, or null for names without a profile.
 *
 * Responsibility: development bots (`bot-NN`) and deleted players ("deleted player 1a2b",
 *                 a name with a space, which no display name has) have no profile; every other
 *                 name links to #/players/<name>. The live match screen passes it to its
 *                 standings and final placement; the Quick Test and the host console do not.
 * Depends on:     ../shell/router
 * Used by:        ../game/MatchScreen
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/05-api-design.md §2.2
 */
import { hrefOf } from '../shell/router.js';

const BOT = /^bot-\d+$/;

export function playerHref(name: string): string | null {
  if (BOT.test(name) || name.includes(' ')) return null;
  return hrefOf({ name: 'player', displayName: name });
}
