/**
 * @file   packages/application/src/match/create.ts
 * @module application/match
 * @brief  A new match from the starter's choices and the published default ruleset (11 §3.2).
 *
 * Responsibility: check the prize list (classic types: at least one built-in prize, kept
 *                 in catalogue order; royale: none), clamp the timed-draw seconds into the
 *                 allowed range (D12), raise a missed-number delay to the speed window,
 *                 keep the pause between royale rounds at its minimum or above (D14), and build the match record plus the `openLobby` command that
 *                 freezes the ruleset and the seed (01 §3a, §5, §6, §9).
 * Depends on:     @sbr/contracts, @sbr/domain, ./ports, ./rulesets, ./timing
 * Used by:        ./engine, ../index
 * Spec:           docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §3a.1, §5, §6
 */
import {
  BUILTIN_PRIZE_CATALOGUE_ORDER,
  type Command,
  type GameType,
  type MarkingMode,
  type MissedNumbers,
} from '@sbr/domain';

import {
  DEFAULT_ROUND_PAUSE_MS,
  DEFAULT_RULESETS,
  MIN_ROUND_PAUSE_MS,
  type Ruleset,
} from '@sbr/contracts';

import type { DrawMode, NewMatchRecord, RoundPause, StartRule } from './ports.js';
import { defaultRulesetFor, toMatchRuleset } from './rulesets.js';
import { chosenMissedNumbers, withinDrawRange } from './timing.js';

export interface CreateMatchInput {
  readonly title: string;
  readonly gameType: GameType;
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
// minimum; 6 s by default.
function chosenRoundPause(chosen: RoundPause | undefined): RoundPause {
  if (chosen?.kind === 'host') return chosen;
  return { kind: 'wait', ms: Math.max(MIN_ROUND_PAUSE_MS, chosen?.ms ?? DEFAULT_ROUND_PAUSE_MS) };
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

export function toNewMatch(
  input: CreateMatchInput,
  prizes: readonly string[],
  ids: NewMatchIds,
): { readonly record: NewMatchRecord; readonly openLobby: Command } {
  const ruleset = input.ruleset?.ruleset ?? defaultRulesetFor(input.gameType);
  const windowMs = ruleset.marking.speedWindowMs;
  const markingMode = input.markingMode ?? 'manual';
  const missedNumbers = chosenMissedNumbers(input.missedNumbers, windowMs);
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
      markingMode,
      missedNumbers,
      drawMode: input.drawMode,
      drawIntervalMs: withinDrawRange(
        input.drawIntervalMs ?? ruleset.draws.intervalMsRealtime,
        windowMs,
        missedNumbers,
      ),
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
    ruleset: toMatchRuleset(ruleset, markingMode, missedNumbers),
    seed: ids.seed,
    tickedPrizes: prizes,
  };
  return { record, openLobby };
}
