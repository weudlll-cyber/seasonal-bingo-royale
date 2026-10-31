/**
 * @file   apps/web/src/game/interludePlan.ts
 * @module web/game
 * @brief  Which recap cards the interlude shows, in what order and for how long (D20).
 *
 * Responsibility: from the server's recap and the pause: the cards with content (top three,
 *                 climber, cut and shield saves, seasons and the fastest tapper, the round's
 *                 facts). In a timed pause (D14) the cards share the time left evenly, each at
 *                 least CALM_CARD_MS (a calm reading time); if the pause is too short, the most
 *                 important are kept (top three, cut, seasons and speed, climber, facts) instead
 *                 of rushing. With "the host starts the next round" each card shows for
 *                 CALM_CARD_MS and they loop. Display only: nothing here computes a score or a
 *                 ranking.
 * Depends on:     @sbr/contracts (types), ./labels (types)
 * Used by:        ./Interlude, ../components/Playback (types), ../App (types)
 * Spec:           docs/spec/01-game-design.md §7 (D14, D20)
 */
import type { RoundRecap } from '@sbr/contracts';

import type { RecapCard } from './labels.js';

// Reading time of one card at a calm pace (NIGHT-7 step 3): the cards of a full recap hold
// 9–23 words (climber 9, facts 12, top three 16, seasons and speed 19, a cut with eight
// names 23); at 200 words a minute plus about a second to find one's way on a new card that
// is 3.7–7.9 s, 5.7 s on average. Names in a list are skimmed rather than read, so 5 s.
export const CALM_CARD_MS = 5_000;

// The order on screen, and which cards stay when the pause is short.
const SHOWN_IN: readonly RecapCard[] = ['top', 'climber', 'cut', 'seasons', 'facts'];
const KEPT_FIRST: readonly RecapCard[] = ['top', 'cut', 'seasons', 'climber', 'facts'];

export type Pause = { readonly kind: 'wait'; readonly ms: number } | { readonly kind: 'host' };

export interface InterludePlan {
  readonly cards: readonly RecapCard[];
  readonly cardMs: number;
  // The host starts the next round: the cards go round until then.
  readonly loop: boolean;
}

function hasContent(recap: RoundRecap, card: RecapCard): boolean {
  switch (card) {
    case 'top':
      return recap.top !== undefined;
    case 'climber':
      return recap.climber !== undefined;
    case 'cut':
      return recap.cut !== undefined;
    case 'seasons':
      return recap.seasonComplete !== undefined || recap.fastest !== undefined;
    case 'facts':
      return true;
  }
}

// `leftMs`: the time left in a timed pause when the interlude appears (null: the whole pause).
export function planInterlude(
  recap: RoundRecap,
  pause: Pause,
  leftMs: number | null,
): InterludePlan {
  const withContent = KEPT_FIRST.filter((card) => hasContent(recap, card));
  if (pause.kind === 'host') {
    return { cards: inShownOrder(withContent), cardMs: CALM_CARD_MS, loop: true };
  }
  const time = Math.max(0, leftMs ?? pause.ms);
  const fit = Math.max(1, Math.min(withContent.length, Math.floor(time / CALM_CARD_MS)));
  const cards = inShownOrder(withContent.slice(0, fit));
  return { cards, cardMs: Math.max(CALM_CARD_MS, time / cards.length), loop: false };
}

function inShownOrder(cards: readonly RecapCard[]): readonly RecapCard[] {
  return SHOWN_IN.filter((card) => cards.includes(card));
}
