/**
 * @file   apps/web/src/host/createForm.ts
 * @module web/host
 * @brief  The create form's values, their defaults, the D12 check and the POST /matches body.
 *
 * Responsibility: what the host fills in (title, game type, prizes, draws, missed numbers,
 *                 leaderboard, max players, royale pause, the development-only fast test
 *                 profile), the starting values, the message for seconds below the shortest
 *                 interval (D12), and the request body (05 §2.3; the server clamps seconds
 *                 and delays into range as well).
 * Depends on:     ../components/StartMarkingField, ../drawControl, ../prizes, ../types, ./TimingFields
 * Used by:        ./CreateMatch
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §3a, §5, §6, §7.1
 */
import {
  INITIAL_MARKING,
  toMissedNumbers,
  type MarkingChoice,
} from '../components/StartMarkingField.js';
import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import { DEFAULT_PRIZES, PRIZE_CATALOGUE } from '../prizes.js';
import type { GameType } from '../types.js';
import {
  INITIAL_PAUSE,
  intervalProblem,
  rulesetIntervalMs,
  shortestInterval,
  toRoundPause,
  type RoundPauseChoice,
} from './TimingFields.js';

export interface FormValues {
  readonly title: string;
  readonly gameType: GameType;
  readonly prizes: ReadonlySet<string>;
  readonly draw: DrawControl;
  readonly missed: MarkingChoice;
  // null until the host touches it: then the game type's default applies.
  readonly leaderboard: boolean | null;
  readonly maxPlayers: number;
  // Royale: wait N seconds between rounds, or the host starts each one (D14).
  readonly pause: RoundPauseChoice;
  // Development only: the server's fast test profile (short royale for the play-through).
  readonly fast: boolean;
}

export const INITIAL: FormValues = {
  title: 'Bingo night',
  gameType: 'royale',
  prizes: new Set(DEFAULT_PRIZES),
  draw: INITIAL_CONTROL,
  missed: INITIAL_MARKING,
  leaderboard: null,
  maxPlayers: 20,
  pause: INITIAL_PAUSE,
  fast: false,
};

// The seconds between draws below the match's shortest interval (D12): the message, else null.
export function intervalMessage(v: FormValues): string | null {
  const chosen =
    v.draw.intervalSec === null ? rulesetIntervalMs(v.gameType) : v.draw.intervalSec * 1000;
  return intervalProblem(chosen, shortestInterval(v.gameType, toMissedNumbers(v.missed)));
}

// The POST /matches body (05 §2.3); the server clamps seconds and delays into range.
export function createBody(v: FormValues) {
  return {
    title: v.title,
    gameType: v.gameType,
    ...(v.gameType === 'royale' ? {} : { prizes: PRIZE_CATALOGUE.filter((p) => v.prizes.has(p)) }),
    drawMode: v.draw.mode,
    ...(v.draw.intervalSec === null
      ? {}
      : { drawIntervalMs: Math.round(v.draw.intervalSec * 1000) }),
    missedNumbers: toMissedNumbers(v.missed),
    countsForLeaderboard: v.leaderboard ?? v.gameType === 'royale',
    maxPlayers: Math.min(200, Math.max(2, v.maxPlayers)),
    ...(v.gameType === 'royale' ? { roundPause: toRoundPause(v.pause) } : {}),
    ...(v.fast ? { testProfile: 'fast' as const } : {}),
  };
}
