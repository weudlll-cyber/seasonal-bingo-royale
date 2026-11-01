/**
 * @file   packages/application/src/match/create.ts
 * @module application/match
 * @brief  A new match from the starter's choices and the published default ruleset (11 §3.2).
 *
 * Responsibility: check the prize list (classic types: at least one built-in prize, kept
 *                 in catalogue order; royale: none) and the mode (asynchronous: royale only),
 *                 clamp the timed-draw interval into the mode's range (D12; async 1 min–24 h),
 *                 raise a missed-number delay to the speed window, take the async defaults
 *                 (automatic marking, quiet hours, time zone), keep the pause between royale
 *                 rounds at its minimum or above (D14), and build the match record plus the
 *                 `openLobby` command that freezes the ruleset and the seed (01 §3a, §5, §6, §9).
 * Depends on:     @sbr/contracts, @sbr/domain, ./ports, ./quietHours, ./rulesets, ./timing
 * Used by:        ./engine, ../index
 * Spec:           docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §3a.1, §5, §6, §11
 */
import {
  BUILTIN_PRIZE_CATALOGUE_ORDER,
  type Command,
  type GameType,
  type MarkingMode,
  type MatchMode,
  type MissedNumbers,
} from '@sbr/domain';

import {
  DEFAULT_ROUND_PAUSE_MS,
  DEFAULT_RULESETS,
  MIN_ROUND_PAUSE_MS,
  type QuietHours,
  type Ruleset,
} from '@sbr/contracts';

import type { DrawMode, MatchSettings, NewMatchRecord, RoundPause, StartRule } from './ports.js';
import { isTimeZone } from './quietHours.js';
import { defaultRulesetFor, toMatchRuleset } from './rulesets.js';
import { chosenMissedNumbers, withinDrawRange } from './timing.js';

export interface CreateMatchInput {
  readonly title: string;
  readonly gameType: GameType;
  // Realtime by default; asynchronous only for the royale (01 §11).
  readonly mode?: MatchMode | undefined;
  // Asynchronous only (01 §5): the ruleset's quiet hours when left out, none with null,
  // read in the starter's IANA time zone (UTC when missing or unknown).
  readonly quietHours?: QuietHours | null | undefined;
  readonly timeZone?: string | undefined;
  readonly prizes?: readonly string[] | undefined;
  readonly markingMode?: MarkingMode | undefined;
  readonly drawMode: DrawMode;
  readonly drawIntervalMs?: number | undefined;
  readonly missedNumbers: MissedNumbers;
  readonly countsForLeaderboard?: boolean | undefined;
  readonly maxPlayers: number;
  readonly roundPause?: RoundPause | undefined;
  // How the match starts (01 §7.6); the host starts it by default.
  readonly startRule?: StartRule | undefined;
  // Instead of the published default of the game type: a named ruleset (the server passes
  // its development-only fast test profile here; production never does).
  readonly ruleset?: { readonly name: string; readonly ruleset: Ruleset } | undefined;
}

// The pause between royale rounds (D14): the chosen one, a wait never shorter than the
// minimum; 15 s by default (D21).
function chosenRoundPause(chosen: RoundPause | undefined): RoundPause {
  if (chosen?.kind === 'host') return chosen;
  return { kind: 'wait', ms: Math.max(MIN_ROUND_PAUSE_MS, chosen?.ms ?? DEFAULT_ROUND_PAUSE_MS) };
}

// Only the royale has an asynchronous ruleset (01 §11).
export function modeAllowed(input: CreateMatchInput): boolean {
  return input.mode !== 'async' || input.gameType === 'royale';
}

// Royale has no prize list; a classic type needs at least one known prize (01 §3a.1).
export function prizesFor(input: CreateMatchInput): readonly string[] | null {
  if (input.gameType === 'royale') return [];
  const wanted = new Set(input.prizes ?? defaultRulesetFor(input.gameType).defaultPrizes ?? []);
  if (wanted.size === 0) return null;
  if ([...wanted].some((key) => !BUILTIN_PRIZE_CATALOGUE_ORDER.includes(key))) return null;
  return BUILTIN_PRIZE_CATALOGUE_ORDER.filter((key) => wanted.has(key));
}

interface NewMatchIds {
  readonly id: string;
  readonly code: string;
  readonly seed: Uint8Array;
  readonly createdBy: string | null;
}

// The draw settings: realtime as before; an asynchronous match marks automatically by
// default, draws every 15 minutes by default within its range, and has quiet hours in its
// time zone (01 §5, §6, §11).
function drawSettings(
  input: CreateMatchInput,
  ruleset: Ruleset,
): Omit<MatchSettings, 'drawMode' | 'roundPause' | 'startRule'> {
  const windowMs = ruleset.marking.speedWindowMs;
  const missedNumbers = chosenMissedNumbers(input.missedNumbers, windowMs);
  const isAsync = ruleset.mode === 'async';
  const fallbackMs = isAsync ? ruleset.draws.intervalMsAsync : ruleset.draws.intervalMsRealtime;
  // null switches the ruleset's quiet hours off.
  const quiet = input.quietHours === undefined ? ruleset.draws.quietHours : input.quietHours;
  return {
    markingMode: input.markingMode ?? (isAsync ? ruleset.marking.mode : 'manual'),
    missedNumbers,
    drawIntervalMs: withinDrawRange(
      input.drawIntervalMs ?? fallbackMs,
      windowMs,
      missedNumbers,
      ruleset.mode,
    ),
    quietHours: isAsync ? quiet : null,
    timeZone: input.timeZone !== undefined && isTimeZone(input.timeZone) ? input.timeZone : 'UTC',
  };
}

export function toNewMatch(
  input: CreateMatchInput,
  prizes: readonly string[],
  ids: NewMatchIds,
): { readonly record: NewMatchRecord; readonly openLobby: Command } {
  const ruleset = input.ruleset?.ruleset ?? defaultRulesetFor(input.gameType, input.mode);
  const draws = drawSettings(input, ruleset);
  const record: NewMatchRecord = {
    id: ids.id,
    code: ids.code,
    title: input.title,
    gameType: input.gameType,
    rulesetName:
      input.ruleset?.name ??
      DEFAULT_RULESETS.find((r) => r.ruleset === ruleset)?.name ??
      input.gameType,
    ruleset,
    maxPlayers: input.maxPlayers,
    prizes,
    countsForLeaderboard: input.countsForLeaderboard ?? ruleset.countsForLeaderboard,
    settings: {
      ...draws,
      drawMode: input.drawMode,
      roundPause: chosenRoundPause(input.roundPause),
      startRule: input.startRule ?? { kind: 'host' },
    },
    createdBy: ids.createdBy,
    seed: ids.seed,
  };
  const openLobby: Command = {
    type: 'openLobby',
    matchId: ids.id,
    gameType: input.gameType,
    ruleset: toMatchRuleset(ruleset, draws.markingMode, draws.missedNumbers),
    seed: ids.seed,
    tickedPrizes: prizes,
  };
  return { record, openLobby };
}
