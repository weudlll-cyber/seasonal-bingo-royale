/**
 * @file   apps/web/src/game/seasonText.ts
 * @module web/game
 * @brief  The seasons and their effects in plain sentences (01 §8.2, §8.3, PLAYER-CLARITY).
 *
 * Responsibility: one short sentence per active effect with the season's name ("Summer boost:
 *                 your marks and speed bonus count ×1.5 — 5 more numbers": patterns, the
 *                 harvest and Season Complete are not multiplied, D44; "— this number only" on
 *                 its last draw), the Winter shield with its margin and charges left, what a used shield did ("Your Winter shield saved
 *                 you in cut 1 (you were 2 places below the line)"), the owner's season as an
 *                 event line (the Autumn harvest with its points), and the Season Complete
 *                 note, and before the match starts one overview line per season from the frozen
 *                 ruleset (`seasonOverviewLine`). Every number comes from the match's ruleset or the
 *                 server's status.
 * Depends on:     ../types
 * Used by:        ../components/OwnerStatusPanel, ../components/CutScreen, ../playbackScoring,
 *                 ./SeasonsOverview
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3, §13
 */
import type { Effect, Season } from '../types.js';

export const seasonName = (s: Season): string => s.charAt(0).toUpperCase() + s.slice(1);

// The effect's short name after the season: "Summer boost", "Winter shield".
const EFFECT_WORD: Readonly<Record<Effect['type'], string>> = {
  none: '',
  addPoints: 'bonus',
  multiplier: 'boost',
  growth: 'growth',
  harvest: 'harvest',
  shield: 'shield',
  revealNext: 'preview',
};

function effectTitle(season: Season, effect: Effect): string {
  const word = EFFECT_WORD[effect.type];
  return word === '' ? seasonName(season) : `${seasonName(season)} ${word}`;
}

// The draws still to come after this one (the server's count); 0 on the effect's last draw.
const numbersLeft = (n: number): string =>
  n === 0 ? 'this number only' : `${String(n)} more ${n === 1 ? 'number' : 'numbers'}`;

const places = (n: number): string => `${String(n)} ${n === 1 ? 'place' : 'places'}`;

export function boostSentence(season: Season, factor: number, remaining: number): string {
  return `${seasonName(season)} boost: your marks and speed bonus count ×${String(factor)} — ${numbersLeft(remaining)}`;
}

export function growthSentence(season: Season, remaining: number): string {
  return `${seasonName(season)} growth: every mark earns extra points, more with each mark — ${numbersLeft(remaining)}`;
}

// "saves you once …" for a one-charge shield, "… N left" with the charges the player holds.
export function shieldSentence(season: Season, rankMargin: number, charges: number): string {
  const times = charges === 1 ? 'once' : `${String(charges)} times`;
  return `${seasonName(season)} shield: saves you ${times} at a cut if you are at most ${places(rankMargin)} below the line — ${String(charges)} left`;
}

export function shieldSavedLine(cut: number, placesBelow: number): string {
  const where = placesBelow > 0 ? ` (you were ${places(placesBelow)} below the line)` : '';
  return `Your Winter shield saved you in cut ${String(cut)}${where}`;
}

// The Season Complete note under the four seasons.
export const seasonCompleteNote = (points: number): string =>
  `all four give +${String(points)} (Season Complete)`;

// What a season does once collected, before the match starts (the waiting room's overview): the
// same sentences as the status panel, with the effect's full duration or charges from the match's
// frozen ruleset in place of what is left. Harvest, bonus and preview have no status sentence, so
// they get their own here, in the same words.
export function seasonOverviewLine(season: Season, effect: Effect): string {
  switch (effect.type) {
    case 'multiplier':
      return boostSentence(season, effect.factor, effect.durationDraws);
    case 'growth':
      return growthSentence(season, effect.durationDraws);
    case 'shield':
      return shieldSentence(season, effect.rankMargin, effect.charges);
    case 'harvest':
      return `${effectTitle(season, effect)}: +${String(effect.pointsPerMarked)} points for each marked cell in your ${effect.scope}`;
    case 'addPoints':
      return `${effectTitle(season, effect)}: +${String(effect.points)} points`;
    case 'revealNext':
      return `${effectTitle(season, effect)}: shows you the next ${String(effect.count)} ${effect.count === 1 ? 'number' : 'numbers'}`;
    case 'none':
      return `${seasonName(season)}: no effect of its own, it counts towards Season Complete`;
  }
}

interface SeasonEvent {
  readonly season: Season;
  readonly instantPoints: number;
}

// The owner's own season as an event line: instant points with what they were for, or
// the effect that is now active.
export function ownSeasonLine(ev: SeasonEvent, effect: Effect | undefined): string {
  const name = effect === undefined ? seasonName(ev.season) : effectTitle(ev.season, effect);
  if (effect?.type === 'harvest') {
    return `${name}: +${String(ev.instantPoints)} points for the marked cells in your ${effect.scope}`;
  }
  if (ev.instantPoints > 0) return `${name}: +${String(ev.instantPoints)} points`;
  return `${name} is yours`;
}
