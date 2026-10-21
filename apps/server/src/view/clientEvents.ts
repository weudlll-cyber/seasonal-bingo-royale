/**
 * @file   apps/server/src/view/clientEvents.ts
 * @module server/view
 * @brief  Prepares a match event log for the player client (Quick Test and live match).
 *
 * Responsibility: (1) rename the internal player ids (simulation p000…, account ids) to
 *                 the names the client shows (owner-01 / bot-02 in the Quick Test,
 *                 display names in a live match) in every event, so the client can match events to players; (2) replay the log
 *                 with the domain's evolve and record the owner's effect status (active
 *                 multiplier/growth with remaining draws, shield charges, seasons
 *                 collected) whenever it changes, and every player's points after each
 *                 stage start (score carry), so the client renders them and never
 *                 computes them (CLAUDE.md: the server decides, the client renders).
 * Depends on:     @sbr/domain
 * Used by:        ./clientView, ../dev/quicktest.ts
 * Spec:           docs/spec/01-game-design.md §8.2, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { createInitialMatchState, evolve, type DomainEvent, type MatchState } from '@sbr/domain';

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
  const rename = (id: string): string => idMap.get(id) ?? id;
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

export interface ClientReplay {
  readonly ownerStatus: Record<string, OwnerStatus[]>;
  readonly stagePoints: StagePoints[];
}

// Replays the original (internal-id) log once with the domain's evolve. Keeps one status
// list per owner, with an entry only when that owner's status changed, and the points
// after each stage start. Keyed by display id.
export function replayForClient(
  events: readonly DomainEvent[],
  idMap: ReadonlyMap<string, string>,
  owners: ReadonlyMap<string, string>,
): ClientReplay {
  const timeline: Record<string, OwnerStatus[]> = {};
  for (const displayId of owners.values()) timeline[displayId] = [];
  const stagePoints: StagePoints[] = [];
  let state = createInitialMatchState();
  events.forEach((ev, i) => {
    state = evolve(state, ev);
    if (ev.type === 'stageStarted') stagePoints.push(pointsAfter(state, idMap, i + 1));
    for (const [internalId, displayId] of owners) {
      const status = statusOf(state, internalId, i + 1);
      const list = timeline[displayId];
      if (list === undefined || status === null) continue;
      const last = list[list.length - 1];
      if (last === undefined || !sameStatus(last, status)) list.push(status);
    }
  });
  return { ownerStatus: timeline, stagePoints };
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
