/**
 * @file   apps/web/src/playback.ts
 * @module web
 * @brief  Lifecycle playback view-model for the Quick Test (WP-08, 01 §3, §13).
 *
 * Responsibility: fold the server's event stream up to the step the owner is watching
 *                 into a view-model: stage and round, draws so far, every player's
 *                 current-round cards and marks, points, seasons, eliminations (and the
 *                 cut each player went out in), the owner's outcome at the latest cut,
 *                 banners in plain English and the owner's effect status.
 *                 It only adds up points the server already computed, and takes the
 *                 server's points as the new baseline at every stage start. Pure.
 * Depends on:     ./types, ./playbackTypes, ./playbackScoring (scoring events), ./standingsOrder,
 *                 ./game/labels (event lines in plain English)
 * Used by:        ./App, ./components/*, ./game/*, ./host/*
 * Spec:           docs/spec/01-game-design.md §3, §7, §8, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { abortLine, CUT_NOTE, cutLine, roundEndLine } from './game/labels.js';
import type { CutOutcome, PlaybackView } from './playbackTypes.js';
import { applyScoring, pushBanner, update, type FoldState } from './playbackScoring.js';
import { standingsOrder } from './standingsOrder.js';
import type { Card, DomainEventLike, OwnerStatus, QuickTestResult } from './types.js';

export type {
  Banner,
  CutOutcome,
  CutView,
  PlaybackView,
  PlayerView,
  PrizeWin,
} from './playbackTypes.js';

export function playbackAt(result: QuickTestResult, step: number): PlaybackView {
  const consumed = Math.min(step, result.events.length);
  const state = foldEvents(result, consumed);
  const players = [...state.players.values()];
  const owners = players.filter((p) => p.isOwner);
  return {
    currentStage: state.stageIndex,
    currentRound: state.roundIndex,
    roundStage: state.roundStage,
    drawsSoFar: state.drawsSoFar,
    totalDraws: state.totalDraws,
    standings: players.sort(standingsOrder),
    owners,
    ownerStatus: Object.fromEntries(
      owners.map((o) => [o.accountId, statusAt(result.ownerStatus[o.accountId], consumed)]),
    ),
    lastCut: state.lastCut,
    prizeWinners: state.prizeWinners,
    banners: state.banners,
    roundOver: state.roundOver,
    finished: state.finished,
  };
}

// Latest status whose step is at or before the consumed step.
function statusAt(list: readonly OwnerStatus[] | undefined, step: number): OwnerStatus | null {
  let current: OwnerStatus | null = null;
  for (const entry of list ?? []) {
    if (entry.step > step) break;
    current = entry;
  }
  return current;
}

function foldEvents(result: QuickTestResult, step: number): FoldState {
  const state: FoldState = {
    stageIndex: 0,
    roundIndex: 0,
    roundStage: 0,
    drawsSoFar: [],
    totalDraws: 0,
    players: new Map(
      result.players.map((p) => [
        p.accountId,
        {
          accountId: p.accountId,
          isOwner: p.isOwner,
          // Live screens get only their own cards; other players start with none.
          cards: p.card === null ? [] : [p.card],
          marks: p.card === null ? [] : [freeMarks(p.card)],
          points: 0,
          seasonsActivated: 0,
          seasons: [],
          eliminated: false,
          eliminatedRound: null,
          eliminatedCut: null,
        },
      ]),
    ),
    banners: [],
    lastCut: null,
    prizeWinners: {},
    roundOver: false,
    finished: false,
    lastScorer: null,
  };
  // Stage starts reset points to the server's baseline (score carry); keyed by step.
  const baselines = new Map(result.stagePoints.map((s) => [s.step, s.points]));
  result.events.slice(0, step).forEach((ev, i) => {
    applyEvent(state, ev);
    const baseline = baselines.get(i + 1);
    if (baseline !== undefined) applyBaseline(state, baseline);
  });
  return state;
}

function applyBaseline(state: FoldState, points: Readonly<Record<string, number>>): void {
  for (const [id, value] of Object.entries(points))
    update(state, id, (p) => ({ ...p, points: value }));
}

function freeMarks(card: Card): boolean[] {
  return card.cells.map((cell) => cell.kind === 'free');
}

function applyEvent(state: FoldState, ev: DomainEventLike): void {
  if (applyLifecycle(state, ev)) return;
  applyScoring(state, ev);
}

function applyLifecycle(state: FoldState, ev: DomainEventLike): boolean {
  switch (ev.type) {
    case 'stageStarted':
      state.stageIndex = ev.stageIndex;
      return true;
    case 'roundStarted':
      startRound(state, ev);
      return true;
    case 'drawMade':
      state.drawsSoFar.push(ev.item);
      return true;
    case 'cutApplied':
      applyCut(state, ev);
      return true;
    case 'roundEnded':
      state.roundOver = true;
      pushBanner(
        state,
        `round-end-${String(ev.roundIndex)}`,
        roundEndLine({ ...ev, draws: state.drawsSoFar.length, lastScorer: state.lastScorer }),
      );
      return true;
    case 'matchFinished':
      state.finished = true;
      return true;
    case 'matchAborted':
      pushBanner(state, 'aborted', abortLine(ev.reason, ev.by));
      return true;
    default:
      return false;
  }
}

function startRound(
  state: FoldState,
  ev: Extract<DomainEventLike, { type: 'roundStarted' }>,
): void {
  state.roundIndex = ev.roundIndex;
  state.roundStage = state.stageIndex;
  state.roundOver = false;
  state.lastScorer = null;
  state.drawsSoFar = [];
  state.totalDraws = ev.drawSequence.length;
  // Every round deals new cards (royale); marks start again from the free centre.
  for (const [id, p] of state.players) {
    const cards = ev.cardsByPlayer[id];
    if (cards !== undefined) state.players.set(id, { ...p, cards, marks: cards.map(freeMarks) });
  }
}

function applyCut(state: FoldState, ev: Extract<DomainEventLike, { type: 'cutApplied' }>): void {
  const eliminated = new Set(ev.eliminated);
  const saved = new Set(ev.shieldSaves);
  const cutNumber = (state.lastCut?.number ?? 0) + 1;
  for (const id of eliminated) {
    update(state, id, (p) => ({
      ...p,
      eliminated: true,
      eliminatedRound: state.roundIndex,
      eliminatedCut: cutNumber,
    }));
  }
  const owners = [...state.players.values()]
    .filter((p) => p.isOwner && (eliminated.has(p.accountId) || ev.survivors.includes(p.accountId)))
    .map((p) => ({ accountId: p.accountId, outcome: cutOutcome(p.accountId, eliminated, saved) }));
  state.lastCut = { number: cutNumber, owners };
  const line = cutLine({
    number: state.lastCut.number,
    survivors: ev.survivors.length,
    eliminated: ev.eliminated.length,
    saved: ev.shieldSaves.length,
  });
  const ownerNotes = owners.map((o) => ` · ${o.accountId} ${CUT_NOTE[o.outcome]}`).join('');
  pushBanner(
    state,
    `cut-${String(ev.stageIndex)}-${String(state.lastCut.number)}`,
    line + ownerNotes,
  );
}

function cutOutcome(id: string, eliminated: Set<string>, saved: Set<string>): CutOutcome {
  if (eliminated.has(id)) return 'eliminated';
  return saved.has(id) ? 'saved' : 'survived';
}
