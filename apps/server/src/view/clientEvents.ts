/**
 * @file   apps/server/src/view/clientEvents.ts
 * @module server/view
 * @brief  Prepares a match event log for the player client (Quick Test and live match).
 *
 * Responsibility: (1) rename the internal player ids (simulation p000…, account ids) to
 *                 the names the client shows (owner-01 / bot-02 in the Quick Test, display
 *                 names in a live match) in every event, so the client can match events to
 *                 players, and list the ids a batch names (the gateway's name lookup);
 *                 (2) replay the log with the domain's evolve — at once, or extended with
 *                 new events as they come (`LiveReplay`, one per live match) — and record
 *                 each tracked player's effect status (active multiplier/growth with
 *                 remaining draws, shield charges, seasons collected) whenever it changes,
 *                 every player's points after each stage start (score carry) and first-
 *                 round card, so the client renders them and never computes them
 *                 (CLAUDE.md: the server decides, the client renders).
 * Depends on:     @sbr/domain
 * Used by:        ./clientView, ./liveViews, ../realtime/gateway, ../dev/quicktest.ts
 * Spec:           docs/spec/01-game-design.md §8.2, §13; docs/spec/15-implementation-plan.md WP-08
 */
import {
  createInitialMatchState,
  evolve,
  type Card,
  type DomainEvent,
  type MatchState,
} from '@sbr/domain';

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';
export type EffectKind = 'multiplier' | 'growth' | 'harvest' | 'shield' | 'revealNext';

export interface OwnerStatus {
  // Number of events consumed when this status became current (client playback step).
  readonly step: number;
  readonly multiplier: { readonly factor: number; readonly remainingDraws: number } | null;
  readonly growth: { readonly pointsPerMark: number; readonly remainingDraws: number } | null;
  readonly shieldCharges: number;
  readonly seasons: readonly SeasonName[];
}

const SEASONS: readonly SeasonName[] = ['spring', 'summer', 'autumn', 'winter'];

export function renameAccounts(
  events: readonly DomainEvent[],
  idMap: ReadonlyMap<string, string>,
): DomainEvent[] {
  return mapAccounts(events, (id) => idMap.get(id) ?? id);
}

// Every account id the events name (the gateway looks up their display names).
export function accountIdsIn(events: readonly DomainEvent[]): Set<string> {
  const ids = new Set<string>();
  mapAccounts(events, (id) => {
    ids.add(id);
    return id;
  });
  return ids;
}

function mapAccounts(
  events: readonly DomainEvent[],
  rename: (id: string) => string,
): DomainEvent[] {
  return events.map((ev) => renameEvent(ev, rename));
}

function renameEvent(ev: DomainEvent, rename: (id: string) => string): DomainEvent {
  switch (ev.type) {
    case 'playerJoined':
    case 'cellMarked':
    case 'seasonActivated':
    case 'patternScored':
    case 'seasonCompleteFired':
    case 'jackpotClaimed':
    case 'classicPrizeAwarded':
      return { ...ev, accountId: rename(ev.accountId) };
    case 'roundStarted':
      return {
        ...ev,
        cardsByPlayer: Object.fromEntries(
          Object.entries(ev.cardsByPlayer).map(([id, cards]) => [rename(id), cards]),
        ),
      };
    case 'cutApplied':
      return {
        ...ev,
        survivors: ev.survivors.map(rename),
        eliminated: ev.eliminated.map(rename),
        shieldSaves: ev.shieldSaves.map(rename),
      };
    case 'matchFinished':
      return {
        ...ev,
        placement: ev.placement.map((p) => ({ ...p, accountId: rename(p.accountId) })),
      };
    default:
      return ev;
  }
}

// Every player's points right after a stage start, when the stage's score carry
// (keep / reset / scaled) has been applied; the client takes them as the new baseline.
export interface StagePoints {
  readonly step: number;
  readonly points: Readonly<Record<string, number>>;
}

// Replays the original (internal-id) log with the domain's evolve, and can be extended
// with new events (the live view keeps one per match). Keeps one status list per tracked
// player, with an entry only when that player's status changed, the points after each
// stage start, the events renamed for the client and every player's first-round card.
// Keyed by display id.
export class LiveReplay {
  private state = createInitialMatchState();
  private steps = 0;
  readonly ownerStatus: Record<string, OwnerStatus[]> = {};
  readonly stagePoints: StagePoints[] = [];
  readonly renamed: DomainEvent[] = [];
  readonly firstCards = new Map<string, Card>();

  // `tracked`: the internal ids whose status is kept, or 'all' players.
  constructor(
    private readonly idMap: ReadonlyMap<string, string>,
    private readonly tracked: readonly string[] | 'all',
  ) {
    if (tracked !== 'all') for (const id of tracked) this.ownerStatus[idMap.get(id) ?? id] = [];
  }

  get length(): number {
    return this.steps;
  }

  extend(events: readonly DomainEvent[]): void {
    for (const ev of events) {
      this.state = evolve(this.state, ev);
      this.steps += 1;
      if (ev.type === 'stageStarted') {
        this.stagePoints.push(pointsAfter(this.state, this.idMap, this.steps));
      }
      if (ev.type === 'roundStarted') this.noteCards(ev.cardsByPlayer);
      this.noteStatus();
      this.renamed.push(...renameAccounts([ev], this.idMap));
    }
  }

  private noteCards(cardsByPlayer: Readonly<Record<string, readonly Card[]>>): void {
    for (const [id, cards] of Object.entries(cardsByPlayer)) {
      const card = cards[0];
      if (card !== undefined && !this.firstCards.has(id)) this.firstCards.set(id, card);
    }
  }

  private noteStatus(): void {
    const ids = this.tracked === 'all' ? this.state.playerOrder : this.tracked;
    for (const id of ids) {
      const status = statusOf(this.state, id, this.steps);
      if (status === null) continue;
      const list = (this.ownerStatus[this.idMap.get(id) ?? id] ??= []);
      const last = list[list.length - 1];
      if (last === undefined || !sameStatus(last, status)) list.push(status);
    }
  }
}

function pointsAfter(
  state: MatchState,
  idMap: ReadonlyMap<string, string>,
  step: number,
): StagePoints {
  const points: Record<string, number> = {};
  for (const [id, p] of Object.entries(state.players)) points[idMap.get(id) ?? id] = p.points;
  return { step, points };
}

function statusOf(state: MatchState, accountId: string, step: number): OwnerStatus | null {
  const effects = state.players[accountId]?.effects;
  if (effects === undefined) return null;
  return {
    step,
    multiplier: effects.multiplier,
    growth:
      effects.growth === null
        ? null
        : {
            pointsPerMark: effects.growth.pointsPerMark,
            remainingDraws: effects.growth.remainingDraws,
          },
    shieldCharges: effects.shieldCharges,
    // Bit order spring=1, summer=2, autumn=4, winter=8 (domain effectState.ts).
    seasons: SEASONS.filter((_s, bit) => (effects.seasonsActivated & (1 << bit)) !== 0),
  };
}

function sameStatus(a: OwnerStatus, b: OwnerStatus): boolean {
  return (
    a.shieldCharges === b.shieldCharges &&
    a.seasons.length === b.seasons.length &&
    a.multiplier?.factor === b.multiplier?.factor &&
    a.multiplier?.remainingDraws === b.multiplier?.remainingDraws &&
    a.growth?.remainingDraws === b.growth?.remainingDraws
  );
}

// Which season's effect is of which kind, so the client can colour each effect badge.
export function effectSeasons(
  seasons: Readonly<Record<SeasonName, { readonly effect: { readonly type: string } }>>,
): Partial<Record<EffectKind, SeasonName>> {
  const map: Partial<Record<EffectKind, SeasonName>> = {};
  for (const season of SEASONS) {
    const kind = seasons[season].effect.type as EffectKind;
    map[kind] ??= season;
  }
  return map;
}
