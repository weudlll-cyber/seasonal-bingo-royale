/**
 * @file   apps/web/src/game/labels.ts
 * @module web/game
 * @brief  Plain-English names and event lines, shared by all screens.
 *
 * Responsibility: "Battle royale" / "Classic with seasons" / "Classic" for the game types
 *                 (01 §3a) and their order in the forms, prize names ("2 rows", "Full card"), one
 *                 line describing draws, missed numbers and quiet hours with the same words as
 *                 the Quick Test ("Draws: timed (every N seconds)", async "every 15 minutes" …;
 *                 never "auto" alone), a running match's badge ("LIVE", async "In progress"),
 *                 and every event line the banners and the match log show ("Round 1 over — all
 *                 40 numbers drawn", "Cut 1: 12 go on, 8 are out" …), never an internal id.
 * Depends on:     ../types, ./useLiveMatch (types), ../playback
 * Used by:        ./Lobby, ./MatchScreen, ../host/*, ../playback, ../components/*, ./LiveCard,
 *                 ./WaitingRoom, ../playbackScoring, ./Interlude, ./InterludeCards, ./interludePlan,
 *                 ../quicktest/*
 * Spec:           docs/spec/01-game-design.md §3a, §5, §6, §7.3, §7.4, §8.3, §11, §13
 */
import { ballLabel, secondsText as seconds, type GameType } from '../types.js';
import type { PlaybackView } from '../playback.js';
import type { LiveState, MatchSummary } from './useLiveMatch.js';

// The game types in the order every form offers them.
export const GAME_TYPES: readonly GameType[] = ['royale', 'classicSeasons', 'classic'];

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
    aborted: 'Cancelled',
  };
  return names[status];
}

// An interval in plain words: seconds up to a minute (realtime), else minutes or hours
// (asynchronous, 01 §5): "5 seconds", "15 minutes", "1 hour".
export function intervalText(ms: number): string {
  if (ms <= 60_000 || ms % 60_000 !== 0) return `${seconds(ms)} seconds`;
  const [n, unit] = ms % 3_600_000 === 0 ? [ms / 3_600_000, 'hour'] : [ms / 60_000, 'minute'];
  return `${String(n)} ${unit}${n === 1 ? '' : 's'}`;
}

// The badge of a running match: "LIVE" in realtime, "In progress" for an asynchronous
// match, whose numbers come minutes or hours apart (01 §11).
export function runningBadge(mode: MatchSummary['mode']): string {
  return mode === 'async' ? 'In progress' : 'LIVE';
}

export function drawLine(settings: MatchSummary['settings']): string {
  return settings.drawMode === 'auto'
    ? `Draws: timed (every ${intervalText(settings.drawIntervalMs)})`
    : 'Draws: host presses Draw next';
}

export function missedLine(settings: MatchSummary['settings']): string {
  // Asynchronous matches mark every drawn number for every player (01 §6).
  if (settings.markingMode === 'auto') return 'Marking: automatic';
  const rule = settings.missedNumbers;
  return rule.kind === 'autoMarkAfter'
    ? `Missed numbers: marked for you after ${seconds(rule.delayMs)} seconds`
    : 'Missed numbers: left open (tap later without bonus)';
}

const hourText = (h: number): string => `${String(h).padStart(2, '0')}:00`;

// "Quiet hours 00:00–07:00 (Europe/Berlin)" for an asynchronous match that has them (01 §5).
export function quietLine(settings: MatchSummary['settings']): string | null {
  const q = settings.quietHours;
  if (q === null) return null;
  return `Quiet hours ${hourText(q.startHour)}–${hourText(q.endHour)} (${settings.timeZone})`;
}

export function rulesLine(match: MatchSummary): string {
  const quiet = quietLine(match.settings);
  const lines = [drawLine(match.settings), missedLine(match.settings)];
  return (quiet === null ? lines : [...lines, quiet]).join(' · ');
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
interface RoundEndFacts {
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

interface CutFacts {
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
// The progress line of a live match (player screen and host console): during a round
// "Battle royale · stage 1 (qualification) · round 1 · draw 12"; in the pause after it
// the ended round with its own stage, "… · round 1 over", and once the next stage has
// begun "… · stage 2 (elimination) next" — never the new stage with the old draw count.
export function progressText(live: LiveState, view: PlaybackView): string {
  const stage = (index: number): string => {
    const kind = live.view.stagePlan[index]?.kind;
    return live.view.gameType === 'royale' && kind !== undefined
      ? ` · stage ${String(index + 1)} (${kind})`
      : '';
  };
  const head = `${gameTypeName(live.view.gameType)}${stage(view.roundStage)} · round ${String(view.currentRound + 1)}`;
  if (!view.roundOver || view.finished) return `${head} · draw ${String(view.drawsSoFar.length)}`;
  const next = view.currentStage === view.roundStage ? '' : `${stage(view.currentStage)} next`;
  return `${head} over${next}`;
}

export const CUT_NOTE: Readonly<Record<'survived' | 'saved' | 'eliminated', string>> = {
  survived: 'is through',
  saved: 'is through, saved by the Winter shield',
  eliminated: 'is out',
};

export const seasonCompleteLine = (who: string): string => `${who} collected all four seasons`;

// "bot-02 completed 1 row (+150, first)": the points the server scored, with the bonus.
export function patternLine(who: string, prizeKey: string, points: number, first: boolean): string {
  const name = prizeName(prizeKey);
  const what = /^\d/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
  return `${who} completed ${what} (+${String(points)}${first ? ', first' : ''})`;
}

export const jackpotLine = (who: string, value: number): string =>
  `${who} won the seasonal jackpot (+${String(value)} points)`;

// "Full card won by bot-02 on draw 37 (G 52)" (D7).
export function prizeLine(prizeKey: string, who: string, drawIndex: number, item: number): string {
  return `${prizeName(prizeKey)} won by ${who} on ${decidedAt(drawIndex, item)}`;
}

export const decidedAt = (drawIndex: number, item: number): string =>
  `draw ${String(drawIndex + 1)} (${ballLabel(item)})`;

// Events logged before D17 carry no `by`: those were the host's.
export const abortLine = (reason: string, by: 'host' | 'system' = 'host'): string =>
  `Match cancelled by the ${by}: ${reason}`;

// A server error code in plain words; unknown codes get a general sentence, never the code.
// Maintenance adds the operator's reason when there is one (D22).
export function problemText(code: string, reason: string | null = null): string {
  if (code === 'MAINTENANCE') {
    const base = 'Maintenance is on — matches cannot start now.';
    return reason === null ? base : `${base} ${reason}`;
  }
  const texts: Record<string, string> = {
    DRAW_MODE_AUTO: 'Draws are timed — switch to Host draws first.',
    DRAW_NOT_ALLOWED: "Wait until the last number's window has closed.",
    FORBIDDEN: 'Only the host can do that.',
    NOT_YOUR_MATCH: 'Only the host can do that.',
    MATCH_FULL: 'The match is full.',
    MATCH_NOT_IN_LOBBY: 'The match has already started.',
    MATCH_STARTING: 'The countdown is already running.',
    NOT_ENOUGH_PLAYERS: 'Not enough players have joined to start yet.',
    RATE_LIMITED: 'Too many presses — wait a moment.',
    MARK_REJECTED: 'the tap was not accepted.',
    DRAW_TOO_EARLY: 'Not yet — the next number comes when the timed interval has passed.',
    NOT_WAITING_FOR_HOST: 'The next round has already started.',
    SIGN_IN_REQUIRED: 'Please sign in first.',
    INVALID_PRIZES: 'Please tick at least one prize.',
    VALIDATION_FAILED: 'Please check the form.',
    QUIET_HOURS: 'Quiet hours — no numbers are drawn until they end.',
    ASYNC_ROYALE_ONLY: 'Only a battle royale can be played asynchronously.',
  };
  return texts[code] ?? 'Something went wrong — please try again.';
}

/* The interlude between royale rounds (D20): titles and lines of the recap cards. */
export type RecapCard = 'top' | 'climber' | 'cut' | 'seasons' | 'facts';

export const RECAP_TITLE: Readonly<Record<RecapCard, string>> = {
  top: 'Top of the round',
  climber: 'Biggest climber',
  cut: 'The cut',
  seasons: 'Seasons and speed',
  facts: 'The round in numbers',
};

export const recapStep = (index: number, count: number): string =>
  `Card ${String(index + 1)} of ${String(count)}`;

export const climberLine = (from: number, to: number): string =>
  `up from #${String(from)} to #${String(to)}`;

export const cutOutLine = (count: number): string =>
  `${String(count)} ${count === 1 ? 'player is' : 'players are'} out`;

export const moreLine = (count: number): string => `and ${String(count)} more`;

// "a", "a and b", "a, b and c".
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export const shieldSavedLine = (names: readonly string[]): string =>
  `Saved by the Winter shield: ${nameList(names)}`;

export function fastestLine(name: string, averageMs: number, taps: number): string {
  return `Fastest tapper: ${name} — ${seconds(averageMs)} s on average over ${String(taps)} taps`;
}

export function factsLine(numbersDrawn: number, playersLeft: number): string {
  const drawn = `${String(numbersDrawn)} ${numbersDrawn === 1 ? 'number' : 'numbers'} drawn`;
  return `${drawn} · ${String(playersLeft)} ${playersLeft === 1 ? 'player' : 'players'} still in`;
}

export const nextRoundLine = (left: number): string => `Next round in ${String(left)} s`;
