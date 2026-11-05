/**
 * @file   apps/web/src/host/createForm.ts
 * @module web/host
 * @brief  The create form's values, their defaults, the D12 check and the POST /matches body.
 *
 * Responsibility: what the host fills in (title, game type, pace, prizes, draws, missed
 *                 numbers, leaderboard, shown on the website (website mode), max players, royale pause, start rule; in development
 *                 builds only the fast test profile), the starting values, the message for
 *                 seconds below the shortest interval (D12) or minutes out of the async range,
 *                 and the request body (05 §2.3; the server clamps intervals and delays into
 *                 range as well).
 * Depends on:     @sbr/contracts (prize list), ../components/StartMarkingField, ../drawControl,
 *                 ../types, ./AsyncFields, ./TimingFields
 * Used by:        ./CreateMatch, ../quicktest/testMatchSetup, ../quicktest/TestMatch
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §3a, §5, §6, §7.1, §11
 */
import { BUILTIN_PRIZE_KEYS, DEFAULT_PRIZE_SELECTION } from '@sbr/contracts';

import {
  INITIAL_MARKING,
  toMissedNumbers,
  type MarkingChoice,
} from '../components/StartMarkingField.js';
import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import type { GameType } from '../types.js';
import { asyncBody, INITIAL_PACE, minutesProblem, type PaceChoice } from './AsyncFields.js';
import {
  INITIAL_PAUSE,
  intervalProblem,
  rulesetIntervalMs,
  shortestInterval,
  toRoundPause,
  toStartRule,
  type RoundPauseChoice,
  type StartRuleChoice,
} from './TimingFields.js';

// The most players a match can have (05 §2.3; the server checks it as well).
export const MAX_PLAYERS = 200;

export interface FormValues {
  readonly title: string;
  readonly gameType: GameType;
  // Live or asynchronous (royale only, 01 §11).
  readonly pace: PaceChoice;
  readonly prizes: ReadonlySet<string>;
  readonly draw: DrawControl;
  readonly missed: MarkingChoice;
  // null until the host touches it: then the game type's default applies.
  readonly leaderboard: boolean | null;
  // Website mode: "Show on the Seasonal Entertainment website" (D50), off by default.
  readonly website: boolean;
  readonly maxPlayers: number;
  // Royale: wait N seconds between rounds, or the host starts each one (D14).
  readonly pause: RoundPauseChoice;
  // Development only: the server's fast test profile (short royale for the play-through);
  // never set, and never sent, in a production build.
  readonly fast?: boolean;
  // How the match starts (01 §7.6).
  readonly start: StartRuleChoice;
}

export const INITIAL: FormValues = {
  title: 'Bingo night',
  gameType: 'royale',
  pace: INITIAL_PACE,
  prizes: new Set<string>(DEFAULT_PRIZE_SELECTION),
  draw: INITIAL_CONTROL,
  missed: INITIAL_MARKING,
  leaderboard: null,
  website: false,
  maxPlayers: 20,
  pause: INITIAL_PAUSE,
  start: { kind: 'host' },
};

// The pace that applies: asynchronous only for the royale.
export function paceOf(v: FormValues): PaceChoice {
  return v.gameType === 'royale' ? v.pace : INITIAL_PACE;
}

// The seconds between draws below the match's shortest interval (D12), or minutes outside
// the asynchronous range: the message, else null.
export function intervalMessage(v: FormValues): string | null {
  const pace = paceOf(v);
  if (pace.kind === 'async') return minutesProblem(pace);
  const chosen =
    v.draw.intervalSec === null ? rulesetIntervalMs(v.gameType) : v.draw.intervalSec * 1000;
  return intervalProblem(chosen, shortestInterval(v.gameType, toMissedNumbers(v.missed)));
}

// The POST /matches body (05 §2.3); the server clamps seconds and delays into range.
export function createBody(v: FormValues) {
  const pace = paceOf(v);
  return {
    title: v.title,
    gameType: v.gameType,
    ...(v.gameType === 'royale'
      ? {}
      : { prizes: BUILTIN_PRIZE_KEYS.filter((p) => v.prizes.has(p)) }),
    drawMode: v.draw.mode,
    ...(pace.kind === 'async' ? asyncBody(pace) : realtimeInterval(v.draw)),
    missedNumbers: toMissedNumbers(v.missed),
    countsForLeaderboard: v.leaderboard ?? v.gameType === 'royale',
    ...(v.website ? { showOnWebsite: true } : {}),
    maxPlayers: Math.min(MAX_PLAYERS, Math.max(2, v.maxPlayers)),
    ...(v.gameType === 'royale' ? { roundPause: toRoundPause(v.pause) } : {}),
    // Vite makes DEV false in a production build, which then drops this line.
    ...(import.meta.env.DEV && v.fast === true ? { testProfile: 'fast' as const } : {}),
    startRule: toStartRule(v.start, Date.now()) ?? { kind: 'host' as const },
  };
}

// The seconds between timed draws of a live match, when the host gave them.
function realtimeInterval(draw: DrawControl) {
  return draw.intervalSec === null ? {} : { drawIntervalMs: Math.round(draw.intervalSec * 1000) };
}
