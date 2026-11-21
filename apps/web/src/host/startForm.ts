/**
 * @file   apps/web/src/host/startForm.ts
 * @module web/host
 * @brief  The Organizer's choices for one match, the request they make and the summary line.
 *
 * Responsibility: what the "Start a match" page (./StartMatch) holds for the chosen preset:
 *                 title (prefilled with the game type and the day), start, players, speed in
 *                 words, the website switch and the "More" choices (between rounds, missed
 *                 numbers, the league); the POST /matches body that names the preset and the
 *                 speed — the server takes the rules, the interval and the prizes from the
 *                 preset and checks every choice against it (admin-area §3); in development the
 *                 fast test rules instead of the preset. The one-line summary above the button.
 * Depends on:     @sbr/contracts (types), ../components/StartMarkingField, ../game/labels,
 *                 ./asyncTiming (browserTimeZone), ./TimingFields
 * Used by:        ./StartMatch, ./ThisMatchFields
 * Spec:           docs/concepts/admin-area.md §3, §8 (g), (h), (o), §9 piece 4; 05 §2.3
 */
import type { Speed } from '@sbr/contracts';

import {
  INITIAL_MARKING,
  toMissedNumbers,
  type MarkingChoice,
} from '../components/StartMarkingField.js';
import { gameTypeName } from '../game/labels.js';
import type { GameType } from '../types.js';
import { browserTimeZone } from './asyncTiming.js';
import {
  INITIAL_PAUSE,
  toRoundPause,
  toStartRule,
  type RoundPauseChoice,
  type StartRuleChoice,
} from './TimingFields.js';

// A published preset as GET /presets sends it (only what this page needs).
export interface StartPreset {
  readonly id: string;
  readonly name: string;
  readonly gameType: GameType;
  readonly mode: 'realtime' | 'async';
  readonly description: string;
  readonly players: { readonly min: number; readonly max: number; readonly start: number };
  readonly speedsMs: Readonly<Record<Speed, number>>;
  readonly starts: { readonly now: boolean; readonly at: boolean; readonly whenFull: boolean };
  readonly countsForLeaderboard: boolean;
}

export interface StartValues {
  readonly title: string;
  readonly players: number;
  readonly speed: Speed;
  readonly start: StartRuleChoice;
  // Website mode: "Show on the Seasonal Entertainment website" (D50).
  readonly website: boolean;
  readonly pause: RoundPauseChoice;
  readonly missed: MarkingChoice;
  // null until the Organizer touches it: then the preset's default applies.
  readonly leaderboard: boolean | null;
  // Development only: the server's fast test profile instead of the preset.
  readonly fast: boolean;
}

// "Battle royale — Sat 21 Nov".
export const defaultTitle = (gameType: GameType, now: Date): string =>
  `${gameTypeName(gameType)} — ${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;

// The first start the preset allows (now, at a time, when full).
function firstStart(p: StartPreset): StartRuleChoice {
  if (p.starts.now) return { kind: 'host' };
  if (p.starts.at) return { kind: 'at', local: '', auto: false };
  return { kind: 'whenFull' };
}

export function initialValues(p: StartPreset, now: Date): StartValues {
  return {
    title: defaultTitle(p.gameType, now),
    players: p.players.start,
    speed: 'normal',
    start: firstStart(p),
    website: false,
    pause: INITIAL_PAUSE,
    missed: INITIAL_MARKING,
    leaderboard: null,
    fast: false,
  };
}

// "A new number every 5 seconds" / "every 15 minutes".
export function speedText(p: StartPreset, speed: Speed): string {
  const ms = p.speedsMs[speed];
  const minutes = p.mode === 'async';
  const n = Math.round((ms / (minutes ? 60_000 : 1_000)) * 10) / 10;
  return `A new number every ${String(n)} ${minutes ? 'minutes' : 'seconds'}`;
}

const START_WORDS: Readonly<Record<StartRuleChoice['kind'], string>> = {
  host: 'starts when you press Start',
  at: 'starts at the set time',
  whenFull: 'starts when full',
};

// "Battle royale · up to 60 players · starts when full · a new number every 5 seconds".
export function summaryLine(v: StartValues, p: StartPreset): string {
  const speed = speedText(p, v.speed).replace('A new', 'a new');
  return `${p.name} · up to ${String(v.players)} players · ${START_WORDS[v.start.kind]} · ${speed}`;
}

// The POST /matches body: the preset and the speed decide the rules and the interval.
export function startBody(v: StartValues, p: StartPreset, now: number) {
  const fast = import.meta.env.DEV && v.fast;
  return {
    title: v.title,
    gameType: p.gameType,
    ...(fast ? { testProfile: 'fast' as const } : { preset: p.id, speed: v.speed }),
    ...(p.mode === 'async' ? { mode: 'async' as const, timeZone: browserTimeZone() } : {}),
    drawMode: 'auto' as const,
    missedNumbers: toMissedNumbers(v.missed),
    countsForLeaderboard: v.leaderboard ?? p.countsForLeaderboard,
    ...(v.website ? { showOnWebsite: true } : {}),
    maxPlayers: v.players,
    ...(p.gameType === 'royale' ? { roundPause: toRoundPause(v.pause) } : {}),
    startRule: toStartRule(v.start, now) ?? { kind: 'host' as const },
  };
}
