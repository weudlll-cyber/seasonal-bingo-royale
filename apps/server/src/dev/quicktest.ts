/**
 * @file   apps/server/src/dev/quicktest.ts
 * @module server/dev
 * @brief  In-memory Quick Test match runner driven by the real lifecycle (WP-08).
 *
 * Responsibility: given a seed, game type, bot count, owner-card count and ticked
 *                 prize keys, run a complete match through the WP-07 lifecycle and
 *                 return a JSON-friendly payload the player client renders. All three
 *                 game types use `simulateMatch`; the owner's cards sit at the top of
 *                 the player order (ids starting with "owner-") so the client can tell
 *                 them from bots. Determinism (01 §9, 12 §3 inv. 2): the same input
 *                 always returns the same output, including the owner's cards and
 *                 auto-mark positions. Events carry display ids and come with the
 *                 owner's effect timeline (./quicktestEvents).
 * Depends on:     @sbr/domain, @sbr/contracts (defaults), ./quicktestEvents
 * Used by:        ../http/routes/quicktest.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §3a, §13
 */
import { createHash } from 'node:crypto';

import {
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  royaleRealtimeDefault,
  BUILTIN_PRIZE_POINTS,
  type Ruleset,
} from '@sbr/contracts';
import {
  SEED_BYTES,
  simulateMatch,
  type Card,
  type DomainEvent,
  type GameType,
  type MatchRuleset,
  type MatchState,
} from '@sbr/domain';

import {
  effectSeasons,
  renameAccounts,
  replayForClient,
  type EffectKind,
  type OwnerStatus,
  type SeasonName,
  type StagePoints,
} from './quicktestEvents.js';

export interface QuickTestInput {
  readonly gameType: GameType;
  readonly playerCount: number;
  readonly ownerCards: number;
  readonly tickedPrizes: readonly string[];
  readonly seedText: string;
  readonly markingMode: 'auto' | 'manual';
}

export interface QuickTestPlayer {
  readonly accountId: string;
  readonly isOwner: boolean;
  // First-round card; the client follows later rounds through roundStarted events.
  readonly card: Card;
  readonly place: number;
  readonly points: number;
  readonly seasonsActivated: number;
  readonly shieldCharges: number;
}

export interface QuickTestResult {
  readonly gameType: GameType;
  readonly markingMode: 'auto' | 'manual';
  readonly drawIntervalMs: number;
  readonly speedWindowMs: number;
  readonly pointsPerMark: number;
  readonly maxSpeedBonus: number;
  readonly tickedPrizes: readonly string[];
  readonly events: readonly DomainEvent[];
  readonly players: readonly QuickTestPlayer[];
  readonly stagePlan: MatchState['stagePlan'];
  readonly ownerAccountIds: readonly string[];
  readonly ownerStatus: Record<string, OwnerStatus[]>;
  readonly stagePoints: readonly StagePoints[];
  readonly effectSeasons: Partial<Record<EffectKind, SeasonName>>;
}

const OWNER_PREFIX = 'owner-';
const BOT_PREFIX = 'bot-';

export function runQuickTest(input: QuickTestInput): QuickTestResult {
  const seed = seedFromText(input.seedText);
  const ruleset = contractsRulesetFor(input.gameType);
  const matchRuleset = toMatchRuleset(ruleset, input.markingMode);
  const totalPlayers = Math.max(1, input.ownerCards) + input.playerCount;
  const matchId = `qt-${input.gameType}-${input.seedText}`;
  const sim = simulateMatch({
    matchId,
    seed,
    gameType: input.gameType,
    ruleset: matchRuleset,
    playerCount: totalPlayers,
    tickedPrizes: input.tickedPrizes,
  });
  const ownerCount = Math.max(0, Math.min(4, input.ownerCards));
  return buildResult({ input, ruleset, events: sim.events, state: sim.state, ownerCount });
}

function contractsRulesetFor(gameType: GameType): Ruleset {
  if (gameType === 'royale') return royaleRealtimeDefault;
  if (gameType === 'classicSeasons') return classicSeasonsRealtimeDefault;
  return classicRealtimeDefault;
}

function toMatchRuleset(ruleset: Ruleset, markingMode: 'auto' | 'manual'): MatchRuleset {
  const stages =
    ruleset.stages === undefined
      ? classicPlaceholderStages()
      : ruleset.stages.map((s) => {
          const base = {
            kind: s.kind,
            rounds: s.rounds,
            roundEnd: s.roundEnd,
            scoreCarry: s.scoreCarry,
            stageMultiplier: s.stageMultiplier,
            activePatterns: [...s.activePatterns],
          };
          return s.cut === undefined ? base : { ...base, cut: s.cut };
        });
  return {
    mode: ruleset.mode === 'async' ? 'async' : 'realtime',
    markingMode,
    cardsPerPlayer: ruleset.general.cardsPerPlayer,
    freeCenter: ruleset.general.freeCenter,
    pointsPerMark: ruleset.scoring.pointsPerMark,
    firstToPatternBonusPercent: ruleset.scoring.firstToPatternBonusPercent,
    pointsByPrizeKey: BUILTIN_PRIZE_POINTS,
    seasons: ruleset.seasons,
    seasonComplete: ruleset.seasonComplete ?? { points: 0, effect: { type: 'none' } },
    jackpot: ruleset.jackpot ?? { base: 0, growthPerRound: 0 },
    stages,
  };
}

function classicPlaceholderStages(): MatchRuleset['stages'] {
  return [
    {
      kind: 'final',
      rounds: 1,
      roundEnd: { kind: 'firstFullHouse' },
      scoreCarry: { kind: 'reset' },
      stageMultiplier: 1,
      activePatterns: [],
    },
  ];
}

interface BuildArgs {
  readonly input: QuickTestInput;
  readonly ruleset: Ruleset;
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
  readonly ownerCount: number;
}

function buildResult(args: BuildArgs): QuickTestResult {
  const { input, ruleset, events, state, ownerCount } = args;
  const placeByAccount = new Map(state.finalPlacement.map((p) => [p.accountId, p.place]));
  // Internal simulation id (p000, …) → display id (owner-01, bot-02, …).
  const idMap = new Map(
    state.playerOrder.map((accountId, i) => {
      const prefix = i < ownerCount ? OWNER_PREFIX : BOT_PREFIX;
      return [accountId, `${prefix}${String(i + 1).padStart(2, '0')}`];
    }),
  );
  const owners = new Map([...idMap].slice(0, ownerCount));
  const replay = replayForClient(events, idMap, owners);
  const players: QuickTestPlayer[] = state.playerOrder.map((accountId, i) => {
    const p = state.players[accountId];
    return {
      accountId: idMap.get(accountId) ?? accountId,
      isOwner: i < ownerCount,
      card: cardFromEventsFor(events, accountId),
      place: placeByAccount.get(accountId) ?? 0,
      points: p?.points ?? 0,
      seasonsActivated: p === undefined ? 0 : countBits(p.effects.seasonsActivated),
      shieldCharges: p?.effects.shieldCharges ?? 0,
    };
  });
  return {
    gameType: input.gameType,
    markingMode: input.markingMode,
    drawIntervalMs: ruleset.draws.intervalMsRealtime,
    speedWindowMs: ruleset.marking.speedWindowMs,
    pointsPerMark: ruleset.scoring.pointsPerMark,
    maxSpeedBonus: ruleset.scoring.maxSpeedBonus,
    tickedPrizes: input.tickedPrizes,
    events: renameAccounts(events, idMap),
    players,
    stagePlan: state.stagePlan,
    ownerAccountIds: [...owners.values()],
    ownerStatus: replay.ownerStatus,
    stagePoints: replay.stagePoints,
    effectSeasons: effectSeasons(ruleset.seasons),
  };
}

// Pull the card for a given account out of the first roundStarted event. Cards are
// deterministic per (seed, matchId, roundIndex, accountId, cardIndex), so showing the
// first-round card is enough for the owner's view; later rounds are only interesting
// in royale and the browser already projects per-round state from the event stream.
function cardFromEventsFor(events: readonly DomainEvent[], accountId: string): Card {
  for (const ev of events) {
    if (ev.type !== 'roundStarted') continue;
    const cards = ev.cardsByPlayer[accountId];
    if (cards !== undefined && cards.length > 0 && cards[0] !== undefined) return cards[0];
  }
  // No roundStarted recorded a card for this account (should not happen); return an
  // empty 25-cell placeholder so the client renders a blank grid instead of crashing.
  return {
    cells: Array.from({ length: 25 }, (_v, i) =>
      i === 12 ? { kind: 'free' as const } : { kind: 'number' as const, value: 0 },
    ),
    seasonCells: null,
  };
}

function countBits(mask: number): number {
  let count = 0;
  let m = mask;
  while (m > 0) {
    count += m & 1;
    m >>= 1;
  }
  return count;
}

function seedFromText(text: string): Uint8Array {
  const bytes = new Uint8Array(createHash('sha256').update(text).digest());
  return bytes.slice(0, SEED_BYTES);
}
