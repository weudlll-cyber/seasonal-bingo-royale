/**
 * @file   apps/server/src/view/clientView.ts
 * @module server/view
 * @brief  The payload the player client folds: one shape for the Quick Test and a live match.
 *
 * Responsibility: from an event log, the match state and its ruleset, build what the
 *                 client's playback logic renders: the events with display names, every
 *                 player (first-round card, place, points, seasons, shield), the stage plan,
 *                 the owners' effect timeline and the stage-start baselines (./clientEvents),
 *                 the season of each effect and the timing values of the card. The client
 *                 renders this and never computes scores (CLAUDE.md).
 * Depends on:     @sbr/application (drawRange), @sbr/contracts (types), @sbr/domain, ./clientEvents
 * Used by:        ../dev/quicktest.ts, ../http/routes/matchViews.ts
 * Spec:           docs/spec/01-game-design.md §8, §13; docs/spec/15-implementation-plan.md WP-08, WP-12
 */
import { drawRange } from '@sbr/application';
import type { Ruleset } from '@sbr/contracts';
import type {
  Card,
  DomainEvent,
  GameType,
  MarkingMode,
  MatchState,
  MissedNumbers,
} from '@sbr/domain';

import {
  effectSeasons,
  renameAccounts,
  replayForClient,
  type EffectKind,
  type OwnerStatus,
  type SeasonName,
  type StagePoints,
} from './clientEvents.js';

export interface ClientPlayer {
  readonly accountId: string;
  readonly isOwner: boolean;
  // First-round card; the client follows later rounds through roundStarted events.
  readonly card: Card;
  readonly place: number;
  readonly points: number;
  readonly seasonsActivated: number;
  readonly shieldCharges: number;
}

export interface ClientSettings {
  readonly markingMode: MarkingMode;
  readonly missedNumbers: MissedNumbers;
  // Delay the owner's cards were computed with (Quick Test) or the match delay (live).
  readonly ownerAutoMarkDelayMs: number;
  readonly drawIntervalMs: number;
  readonly tickedPrizes: readonly string[];
}

export interface ClientView extends ClientSettings {
  readonly gameType: GameType;
  // Range a starter or host may set for timed draws (01 §5, D8).
  readonly drawIntervalRangeMs: { readonly min: number; readonly max: number };
  readonly speedWindowMs: number;
  readonly pointsPerMark: number;
  readonly maxSpeedBonus: number;
  readonly events: readonly DomainEvent[];
  readonly players: readonly ClientPlayer[];
  readonly stagePlan: MatchState['stagePlan'];
  readonly ownerAccountIds: readonly string[];
  readonly ownerStatus: Record<string, OwnerStatus[]>;
  readonly stagePoints: readonly StagePoints[];
  readonly effectSeasons: Partial<Record<EffectKind, SeasonName>>;
}

export interface ClientViewInput {
  readonly gameType: GameType;
  readonly ruleset: Ruleset;
  readonly settings: ClientSettings;
  readonly events: readonly DomainEvent[];
  readonly state: MatchState;
  // Internal player id → the name the client shows; owners are the viewer's own players.
  readonly idMap: ReadonlyMap<string, string>;
  readonly owners: ReadonlyMap<string, string>;
}

export function buildClientView(input: ClientViewInput): ClientView {
  const { events, state, ruleset, idMap, owners } = input;
  const placeByAccount = new Map(state.finalPlacement.map((p) => [p.accountId, p.place]));
  const replay = replayForClient(events, idMap, owners);
  const players: ClientPlayer[] = state.playerOrder.map((accountId) => {
    const p = state.players[accountId];
    return {
      accountId: idMap.get(accountId) ?? accountId,
      isOwner: owners.has(accountId),
      card: cardFromEventsFor(events, accountId),
      place: placeByAccount.get(accountId) ?? 0,
      points: p?.points ?? 0,
      seasonsActivated: p === undefined ? 0 : countBits(p.effects.seasonsActivated),
      shieldCharges: p?.effects.shieldCharges ?? 0,
    };
  });
  return {
    ...input.settings,
    gameType: input.gameType,
    drawIntervalRangeMs: drawRange(ruleset.marking.speedWindowMs, input.settings.missedNumbers),
    speedWindowMs: ruleset.marking.speedWindowMs,
    pointsPerMark: ruleset.scoring.pointsPerMark,
    maxSpeedBonus: ruleset.scoring.maxSpeedBonus,
    events: renameAccounts(events, idMap),
    players,
    stagePlan: state.stagePlan,
    ownerAccountIds: [...owners.values()],
    ownerStatus: replay.ownerStatus,
    stagePoints: replay.stagePoints,
    effectSeasons: effectSeasons(ruleset.seasons),
  };
}

// The card of an account from the first roundStarted event. Cards are deterministic per
// (seed, matchId, roundIndex, accountId, cardIndex); later rounds come with their events.
function cardFromEventsFor(events: readonly DomainEvent[], accountId: string): Card {
  for (const ev of events) {
    if (ev.type !== 'roundStarted') continue;
    const cards = ev.cardsByPlayer[accountId];
    if (cards !== undefined && cards.length > 0 && cards[0] !== undefined) return cards[0];
  }
  // Before the first round (lobby) there is no card yet: an empty grid with a free centre.
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
