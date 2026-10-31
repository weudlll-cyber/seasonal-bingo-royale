/**
 * @file   apps/web/src/types.ts
 * @module web
 * @brief  The client's view shapes (from @sbr/contracts) and their display helpers.
 *
 * Responsibility: re-export the wire shapes of the Quick Test and live match view, which
 *                 live in @sbr/contracts (one source for server and client), and the small
 *                 display helpers on them: the season of a symbol, a ball's label with its
 *                 column letter, a season's colour token, milliseconds as seconds.
 * Depends on:     @sbr/contracts
 * Used by:        ./App, ./playback, ./manualMarking, ./components/*, ./game/*, ./host/*,
 *                 ./api, ./drawControl, ./playbackScoring, ./playbackTypes, ./seasonIcons,
 *                 ./useDrawTicker
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §5, §13
 */
import { SEASON_NAMES, type Season } from '@sbr/contracts';

export {
  SEASON_NAMES,
  type Card,
  type Cell,
  type DomainEventLike,
  type EffectKind,
  type GameType,
  type MarkingMode,
  type MissedNumbers,
  type OwnerStatus,
  type QuickTestResult,
  type Season,
} from '@sbr/contracts';

// classicSeasons draw items 101–104 are the season symbols (04 §3.4).
export function seasonOfSymbol(item: number): Season | null {
  return SEASON_NAMES[item - 101] ?? null;
}

// Column letters in card order; column ranges B 1–15, I 16–30, N 31–45, G 46–60, O 61–75.
export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

// Milliseconds as seconds for a sentence, to one decimal at most ("3", "2.5").
export const secondsText = (ms: number): string => String(Math.round(ms / 100) / 10);

// A drawn number with its column letter, e.g. "G 52" (01 §5, D7). Symbols have no
// letter: their label is the season's name ("Winter"), shown next to the icon.
export function ballLabel(item: number): string {
  const season = seasonOfSymbol(item);
  if (season !== null) return season.charAt(0).toUpperCase() + season.slice(1);
  const letter = BINGO_LETTERS[Math.floor((item - 1) / 15)] ?? '?';
  return `${letter} ${String(item)}`;
}

// A season's colour: the design token shared with the Seasonal Entertainment website
// (01 §13, packages/ui/src/tokens.css); text and icons on it use var(--color-on-season).
export function seasonColor(season: Season): string {
  return `var(--color-${season})`;
}
