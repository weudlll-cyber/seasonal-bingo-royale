/**
 * @file   apps/server/src/dev/quicktest.ts
 * @module server/dev
 * @brief  In-memory Quick Test match runner driven by the real lifecycle (WP-08).
 *
 * Responsibility: for a seed, game type, bot and owner-card counts and prize keys, run a full
 *                 match through the WP-07 lifecycle (`simulateMatch`) and return a JSON payload;
 *                 owner cards lead the player order (ids "owner-*"). Deterministic incl. owner
 *                 cards and auto-marks (01 §9, 12 §3 inv. 2). Events carry display ids and the
 *                 owner's effect timeline (../view/clientView). Bots mark on the draw (01 §6);
 *                 owner cards, whose taps are unknown here, count as never tapping under
 *                 autoMarkAfter with the chosen delay (noAutoMark: default), in draws of the
 *                 chosen interval. Royale results carry each non-final round's recap (D20).
 * Depends on:     @sbr/domain, @sbr/application (rulesets, timing), ../view/clientView,
 *                 ../view/roundRecap, @sbr/contracts
 * Used by:        ../http/routes/quicktest.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §3a, §6, §13
 */
import { createHash } from 'node:crypto';

import {
  chosenMissedNumbers,
  defaultRulesetFor,
  delayOf,
  toMatchRuleset,
  withinDrawRange,
} from '@sbr/application';
import type { QuickTestResult, Ruleset } from '@sbr/contracts';
import {
  SEED_BYTES,
  simulateMatch,
  type DomainEvent,
  type GameType,
  type MatchState,
  type MissedNumbers,
} from '@sbr/domain';

import { buildClientView } from '../view/clientView.js';
import { buildRoundRecap } from '../view/roundRecap.js';

interface QuickTestInput {
  readonly gameType: GameType;
  readonly playerCount: number;
  readonly ownerCards: number;
  readonly tickedPrizes: readonly string[];
  readonly seedText: string;
  readonly markingMode: 'auto' | 'manual';
  // The starter's missed-number rule for tapping players (01 §6); default autoMarkAfter
  // with DEFAULT_AUTO_MARK_DELAY_MS.
  readonly missedNumbers?: MissedNumbers | undefined;
  // Seconds between timed draws the client plays back with; default the ruleset value.
  readonly drawIntervalMs?: number | undefined;
}

const OWNER_PREFIX = 'owner-';
const BOT_PREFIX = 'bot-';

export function runQuickTest(input: QuickTestInput): QuickTestResult {
  const seed = seedFromText(input.seedText);
  const ruleset = defaultRulesetFor(input.gameType);
  const missedNumbers = chosenMissedNumbers(input.missedNumbers, ruleset.marking.speedWindowMs);
  const speedWindowMs = ruleset.marking.speedWindowMs;
  const drawIntervalMs = withinDrawRange(
    input.drawIntervalMs ?? ruleset.draws.intervalMsRealtime,
    speedWindowMs,
    missedNumbers,
  );
  const matchRuleset = toMatchRuleset(ruleset, input.markingMode, {
    kind: 'autoMarkAfter',
    delayMs: delayOf(missedNumbers),
  });
  const totalPlayers = Math.max(1, input.ownerCards) + input.playerCount;
  const ownerCount = Math.max(0, Math.min(4, input.ownerCards));
  const matchId = `qt-${input.gameType}-${input.seedText}`;
  const sim = simulateMatch({
    matchId,
    seed,
    gameType: input.gameType,
    ruleset: matchRuleset,
    playerCount: totalPlayers,
    tickedPrizes: input.tickedPrizes,
    // Only the owner's cards are people, and only in manual marking mode (01 §6).
    humans: {
      count: input.markingMode === 'manual' ? ownerCount : 0,
      drawIntervalMs,
      speedWindowMs,
    },
  });
  return buildResult({
    input: { ...input, missedNumbers, drawIntervalMs },
    ruleset,
    events: sim.events,
    state: sim.state,
    ownerCount,
  });
}

interface BuildArgs {
  readonly input: QuickTestInput & {
    readonly missedNumbers: MissedNumbers;
    readonly drawIntervalMs: number;
  };
  readonly ruleset: Ruleset;
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
  readonly ownerCount: number;
}

function buildResult(args: BuildArgs): QuickTestResult {
  const { input, ruleset, events, state, ownerCount } = args;
  // Internal simulation id (p000, …) → display id (owner-01, bot-02, …).
  const idMap = new Map(
    state.playerOrder.map((accountId, i) => {
      const prefix = i < ownerCount ? OWNER_PREFIX : BOT_PREFIX;
      return [accountId, `${prefix}${String(i + 1).padStart(2, '0')}`];
    }),
  );
  const view = buildClientView({
    gameType: input.gameType,
    ruleset,
    settings: {
      markingMode: input.markingMode,
      missedNumbers: input.missedNumbers,
      ownerAutoMarkDelayMs: delayOf(input.missedNumbers),
      drawIntervalMs: input.drawIntervalMs,
      tickedPrizes: input.tickedPrizes,
    },
    events,
    state,
    idMap,
    owners: new Map([...idMap].slice(0, ownerCount)),
  });
  const recaps = royaleRecaps(events, idMap, ruleset.marking.speedWindowMs);
  return recaps.length === 0 ? view : { ...view, recaps };
}

// The recap of every royale round another round follows (D20), from the same builder as
// a live match; the simulation keeps no tap times, so there is no fastest tapper.
function royaleRecaps(
  events: readonly DomainEvent[],
  idMap: ReadonlyMap<string, string>,
  speedWindowMs: number,
) {
  const starts = events.flatMap((e) => (e.type === 'roundStarted' ? [e.roundIndex] : []));
  const timed = events.map((event) => ({ event }));
  return starts.slice(0, -1).flatMap((roundIndex) => {
    const recap = buildRoundRecap({ events: timed, roundIndex, idMap, speedWindowMs });
    return recap === null ? [] : [recap];
  });
}

function seedFromText(text: string): Uint8Array {
  const bytes = new Uint8Array(createHash('sha256').update(text).digest());
  return bytes.slice(0, SEED_BYTES);
}
