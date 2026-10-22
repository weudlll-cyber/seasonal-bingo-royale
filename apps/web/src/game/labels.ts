/**
 * @file   apps/web/src/game/labels.ts
 * @module web/game
 * @brief  Plain-English names and event lines, shared by all screens.
 *
 * Responsibility: "Battle royale" / "Classic with seasons" / "Classic" for the game types
 *                 (01 §3a), prize names ("2 rows", "Full card"), one line describing draws
 *                 and missed numbers with the same words as the Quick Test ("Draws: timed
 *                 (every N seconds)" …), never the word "auto" alone, and every event line
 *                 the banners and the match log show ("Round 1 over — all 40 numbers
 *                 drawn", "Cut 1: 12 go on, 8 are out" …), never an internal identifier.
 * Depends on:     ../types, ./useLiveMatch (types)
 * Used by:        ./Lobby, ./MatchScreen, ../host/*, ../playback, ../components/*
 * Spec:           docs/spec/01-game-design.md §3a, §5, §6, §7.3, §7.4, §8.3, §13
 */
import { ballLabel, type GameType } from '../types.js';
import type { PlaybackView } from '../playback.js';
import type { LiveState, MatchSummary } from './useLiveMatch.js';

export function gameTypeName(type: GameType): string {
  if (type === 'royale') return 'Battle royale';
  if (type === 'classicSeasons') return 'Classic with seasons';
  return 'Classic';
}

// A match status in plain words.
export function statusName(status: MatchSummary['status']): string {
  const names: Record<MatchSummary['status'], string> = {
    lobby: 'Open to join',
    running: 'Running',
    finished: 'Finished',
    aborted: 'Stopped',
  };
  return names[status];
}

const seconds = (ms: number): string => String(Math.round(ms / 100) / 10);

export function drawLine(settings: MatchSummary['settings']): string {
  return settings.drawMode === 'auto'
    ? `Draws: timed (every ${seconds(settings.drawIntervalMs)} seconds)`
    : 'Draws: host presses Draw next';
}

export function missedLine(settings: MatchSummary['settings']): string {
  const rule = settings.missedNumbers;
  return rule.kind === 'autoMarkAfter'
    ? `Missed numbers: marked for you after ${seconds(rule.delayMs)} seconds`
    : 'Missed numbers: left open (tap later without bonus)';
}

export function rulesLine(match: MatchSummary): string {
  return `${drawLine(match.settings)} · ${missedLine(match.settings)}`;
}

// Classic prize keys in plain words (01 §3a.1): "rows-2" → "2 rows", "fullCard" → "Full card".
export function prizeName(key: string): string {
  const fixed: Record<string, string> = {
    fourCorners: 'Four corners',
    oneDiagonal: 'One diagonal',
    bothDiagonals: 'Both diagonals',
    fullCard: 'Full card',
  };
  const lines = /^(rows|columns)-(\d)$/.exec(key);
  if (lines === null) return fixed[key] ?? key;
  const [, kind = '', n = '1'] = lines;
  return `${n} ${n === '1' ? kind.slice(0, -1) : kind}`;
}

/* Event lines for banners and the match log (01 §7.3, §7.4, §8.3): plain English, never
   an internal reason or event name. The round-end line names the player who ended it
   when one did (the last pattern of the round). */
export interface RoundEndFacts {
  readonly roundIndex: number;
  readonly reason: string;
  readonly draws: number;
  readonly lastScorer: string | null;
}

export function roundEndLine(f: RoundEndFacts): string {
  const who = f.lastScorer ?? 'a player';
  const why: Record<string, string> = {
    drawCount: `all ${String(f.draws)} ${f.draws === 1 ? 'number' : 'numbers'} drawn`,
    firstBingo: `${who} got the first bingo`,
    bingoQuota: 'enough players got a bingo',
    firstFullHouse: `${who} filled the whole card`,
    poolExhausted: 'every number has been drawn',
    allPrizesAwarded: 'every prize has been won',
  };
  const reason = why[f.reason];
  const head = `Round ${String(f.roundIndex + 1)} over`;
  return reason === undefined ? head : `${head} — ${reason}`;
}

export interface CutFacts {
  readonly number: number;
  readonly survivors: number;
  readonly eliminated: number;
  readonly saved: number;
}

export function cutLine(f: CutFacts): string {
  const saved = f.saved > 0 ? ` (${String(f.saved)} saved by Winter shield)` : '';
  const goOn = `${String(f.survivors)} ${f.survivors === 1 ? 'goes' : 'go'} on`;
  const out = `${String(f.eliminated)} ${f.eliminated === 1 ? 'is' : 'are'} out`;
  return `Cut ${String(f.number)}: ${goOn}, ${out}${saved}`;
}

// Where the match stands: "Battle royale · stage 2 (elimination) · round 3 · draw 12".
interface ProgressFacts {
  readonly gameType: GameType;
  readonly stageKind: string | null;
  readonly stageIndex: number;
  readonly roundIndex: number;
  readonly draws: number;
}

// The progress line of a live match (player screen and host console).
export function progressText(live: LiveState, view: PlaybackView): string {
  return progressLine({
    gameType: live.view.gameType,
    stageKind: live.view.stagePlan[view.currentStage]?.kind ?? null,
    stageIndex: view.currentStage,
    roundIndex: view.currentRound,
    draws: view.drawsSoFar.length,
  });
}

function progressLine(f: ProgressFacts): string {
  const stage =
    f.gameType === 'royale' && f.stageKind !== null
      ? ` · stage ${String(f.stageIndex + 1)} (${f.stageKind})`
      : '';
  return `${gameTypeName(f.gameType)}${stage} · round ${String(f.roundIndex + 1)} · draw ${String(f.draws)}`;
}

export const CUT_NOTE: Readonly<Record<'survived' | 'saved' | 'eliminated', string>> = {
  survived: 'is through',
  saved: 'is through, saved by the Winter shield',
  eliminated: 'is out',
};

export const seasonCompleteLine = (who: string): string => `${who} collected all four seasons`;

export const jackpotLine = (who: string, value: number): string =>
  `${who} won the seasonal jackpot (+${String(value)} points)`;

// "Full card won by bot-02 on draw 37 (G 52)" (D7).
export function prizeLine(prizeKey: string, who: string, drawIndex: number, item: number): string {
  return `${prizeName(prizeKey)} won by ${who} on ${decidedAt(drawIndex, item)}`;
}

export const decidedAt = (drawIndex: number, item: number): string =>
  `draw ${String(drawIndex + 1)} (${ballLabel(item)})`;

export const abortLine = (reason: string): string => `Match stopped by the host: ${reason}`;

// A server error code in plain words; unknown codes get a general sentence, never the code.
export function problemText(code: string): string {
  const texts: Record<string, string> = {
    DRAW_MODE_AUTO: 'Draws are timed — switch to Host draws first.',
    DRAW_NOT_ALLOWED: "Wait until the last number's window has closed.",
    FORBIDDEN: 'Only the host can do that.',
    NOT_YOUR_MATCH: 'Only the host can do that.',
    MATCH_FULL: 'The match is full.',
    MATCH_NOT_IN_LOBBY: 'The match has already started.',
    NOT_ENOUGH_PLAYERS: 'At least 2 players are needed to start.',
    RATE_LIMITED: 'Too many presses — wait a moment.',
    MARK_REJECTED: 'the tap was not accepted.',
    DRAW_TOO_EARLY: 'Not yet — the next number comes when the timed interval has passed.',
    NOT_WAITING_FOR_HOST: 'The next round has already started.',
    SIGN_IN_REQUIRED: 'Please sign in first.',
    INVALID_PRIZES: 'Please tick at least one prize.',
    VALIDATION_FAILED: 'Please check the form.',
  };
  return texts[code] ?? 'Something went wrong — please try again.';
}
