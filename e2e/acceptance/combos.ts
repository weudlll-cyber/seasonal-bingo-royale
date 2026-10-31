/**
 * @file   e2e/acceptance/combos.ts
 * @module e2e/acceptance
 * @brief  The matches the real-game play-through plays, and their titles in plain words.
 *
 * Responsibility: per game type (royale with the fast test profile; classicSeasons with
 *                 the default prizes; classic with fullCard only) one match with timed and
 *                 one with host draws, 8 players each;
 *                 the royale timed match switches draw mode mid-match, the royale host match
 *                 lets the host start every next round (D14).
 * Depends on:     ../realGame (types)
 * Used by:        the acceptance Playwright specs (test helper)
 * Spec:           docs/spec/12-testing-strategy.md §4, §8; docs/spec/01-game-design.md §5, §7.1
 */
import type { NewMatch } from '../realGame.js';

export interface Combo extends Omit<NewMatch, 'title'> {
  readonly name: string;
  readonly switches: boolean;
}

// The fast test profile (development only): a short royale, 8 players in every match, timed
// draws at the shortest interval the missed-number rule allows (D12: 3 s + 1 s).
export const FIELD = 8;
const FAST = { fast: true, maxPlayers: FIELD } as const;

export const COMBOS: readonly Combo[] = [
  {
    name: 'royale-timed',
    gameType: 'royale',
    drawMode: 'auto',
    intervalSec: 4,
    missed: 'autoMarkAfter',
    switches: true,
    ...FAST,
  },
  {
    name: 'royale-host',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'noAutoMark',
    pause: 'host',
    switches: false,
    ...FAST,
  },
  {
    name: 'classicSeasons-timed',
    gameType: 'classicSeasons',
    drawMode: 'auto',
    intervalSec: 4,
    missed: 'noAutoMark',
    switches: false,
    ...FAST,
  },
  {
    name: 'classicSeasons-host',
    gameType: 'classicSeasons',
    drawMode: 'host',
    missed: 'autoMarkAfter',
    switches: false,
    ...FAST,
  },
  {
    name: 'classic-timed',
    gameType: 'classic',
    drawMode: 'auto',
    intervalSec: 4,
    missed: 'autoMarkAfter',
    prizes: ['fullCard'],
    switches: false,
    ...FAST,
  },
  {
    name: 'classic-host',
    gameType: 'classic',
    drawMode: 'host',
    missed: 'noAutoMark',
    prizes: ['fullCard'],
    switches: false,
    ...FAST,
  },
];

// The match title in plain words, as a host would name it.
export function title(combo: Combo): string {
  const type = {
    royale: 'Battle royale',
    classicSeasons: 'Classic with seasons',
    classic: 'Classic',
  };
  return `${type[combo.gameType]} with ${combo.drawMode === 'auto' ? 'timed' : 'host'} draws`;
}
