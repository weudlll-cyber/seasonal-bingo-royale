/**
 * @file   apps/web/src/host/createForm.ts
 * @module web/host
 * @brief  A live match with every choice spelled out: the Quick Test's values and request body.
 *
 * Responsibility: the choices of a live match without a preset (title, game type, prizes,
 *                 draws, missed numbers, leaderboard, shown on the website, max players, royale
 *                 pause, start rule; in development builds only the fast test profile), their
 *                 starting values, the message for seconds below the shortest interval (D12),
 *                 and the POST /matches body (05 §2.3; the server clamps intervals and delays
 *                 into range as well). The Quick Test (development) builds its match with it;
 *                 the Organizer's page starts from a preset instead (./startForm).
 * Depends on:     @sbr/contracts (prize list), ../components/StartMarkingField, ../drawControl,
 *                 ../types, ./TimingFields
 * Used by:        ../quicktest/testMatchSetup, ../quicktest/TestMatch
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

export interface FormValues {
  readonly title: string;
  readonly gameType: GameType;
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
  prizes: new Set<string>(DEFAULT_PRIZE_SELECTION),
  draw: INITIAL_CONTROL,
  missed: INITIAL_MARKING,
  leaderboard: null,
  website: false,
  maxPlayers: 20,
  pause: INITIAL_PAUSE,
  start: { kind: 'host' },
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
    ...(v.gameType === 'royale'
      ? {}
      : { prizes: BUILTIN_PRIZE_KEYS.filter((p) => v.prizes.has(p)) }),
    drawMode: v.draw.mode,
    ...realtimeInterval(v.draw),
    missedNumbers: toMissedNumbers(v.missed),
    countsForLeaderboard: v.leaderboard ?? v.gameType === 'royale',
    ...(v.website ? { showOnWebsite: true } : {}),
    // In the server's range: the field takes its bounds from the server's limits.
    maxPlayers: v.maxPlayers,
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
