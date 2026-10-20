/**
 * @file   apps/web/src/playback.ts
 * @module web
 * @brief  Lifecycle playback view-model for the Quick Test (WP-08, 01 §3, §13).
 *
 * Responsibility: fold the server's event stream up to the step the owner is watching
 *                 into a view-model: stage and round, draws so far, every player's
 *                 current-round cards and marks, points, eliminations, the owner's
 *                 outcome at the latest cut, banners and the owner's effect status.
 *                 It only adds up points the server already computed. Pure.
 * Depends on:     ./types
 * Used by:        ./App, ./components/*
 * Spec:           docs/spec/01-game-design.md §3, §7, §8, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { Card, DomainEventLike, OwnerStatus, QuickTestResult } from './types.js';

export interface Banner {
  readonly key: string;
  readonly text: string;
}

export interface PlayerView {
  readonly accountId: string;
  readonly isOwner: boolean;
  readonly cards: readonly Card[];
  readonly marks: readonly (readonly boolean[])[];
  readonly points: number;
  readonly seasonsActivated: number;
  readonly eliminated: boolean;
}

export type CutOutcome = 'survived' | 'saved' | 'eliminated';

export interface CutView {
  // Counts cuts so far; a new value means a new cut screen.
  readonly number: number;
  readonly owners: readonly { readonly accountId: string; readonly outcome: CutOutcome }[];
}

export interface PlaybackView {
  readonly currentStage: number;
  readonly currentRound: number;
  readonly drawsSoFar: readonly number[];
  readonly totalDraws: number;
  readonly standings: readonly PlayerView[];
  readonly owners: readonly PlayerView[];
  readonly ownerStatus: Readonly<Record<string, OwnerStatus | null>>;
  readonly lastCut: CutView | null;
  // Classic types: winners per prize key, with the draw number that awarded it.
  readonly prizeWinners: Readonly<Record<string, PrizeWin>>;
  readonly banners: readonly Banner[];
  readonly finished: boolean;
}

export interface PrizeWin {
  readonly drawNumber: number;
  readonly accountIds: readonly string[];
}

export function playbackAt(result: QuickTestResult, step: number): PlaybackView {
  const consumed = Math.min(step, result.events.length);
  const state = foldEvents(result, consumed);
  const players = [...state.players.values()];
  const owners = players.filter((p) => p.isOwner);
  return {
    currentStage: state.stageIndex,
    currentRound: state.roundIndex,
    drawsSoFar: state.drawsSoFar,
    totalDraws: state.totalDraws,
    standings: players.sort(
      (a, b) => b.points - a.points || a.accountId.localeCompare(b.accountId),
    ),
    owners,
    ownerStatus: Object.fromEntries(
      owners.map((o) => [o.accountId, statusAt(result.ownerStatus[o.accountId], consumed)]),
    ),
    lastCut: state.lastCut,
    prizeWinners: state.prizeWinners,
    banners: state.banners,
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

interface FoldState {
  stageIndex: number;
  roundIndex: number;
  drawsSoFar: number[];
  totalDraws: number;
  players: Map<string, PlayerView>;
  banners: Banner[];
  lastCut: CutView | null;
  prizeWinners: Record<string, PrizeWin>;
  finished: boolean;
}

function foldEvents(result: QuickTestResult, step: number): FoldState {
  const state: FoldState = {
    stageIndex: 0,
    roundIndex: 0,
    drawsSoFar: [],
    totalDraws: 0,
    players: new Map(
      result.players.map((p) => [
        p.accountId,
        {
          accountId: p.accountId,
          isOwner: p.isOwner,
          cards: [p.card],
          marks: [freeMarks(p.card)],
          points: 0,
          seasonsActivated: 0,
          eliminated: false,
        },
      ]),
    ),
    banners: [],
    lastCut: null,
    prizeWinners: {},
    finished: false,
  };
  for (const ev of result.events.slice(0, step)) applyEvent(state, ev);
  return state;
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
      pushBanner(state, `round-end-${String(ev.roundIndex)}`, roundEndText(ev));
      return true;
    case 'matchFinished':
      state.finished = true;
      return true;
    case 'matchAborted':
      pushBanner(state, 'aborted', `Match aborted: ${ev.reason}`);
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
  for (const id of eliminated) update(state, id, (p) => ({ ...p, eliminated: true }));
  const owners = [...state.players.values()]
    .filter((p) => p.isOwner && (eliminated.has(p.accountId) || ev.survivors.includes(p.accountId)))
    .map((p) => ({ accountId: p.accountId, outcome: cutOutcome(p.accountId, eliminated, saved) }));
  state.lastCut = { number: (state.lastCut?.number ?? 0) + 1, owners };
  const shield = ev.shieldSaves.length > 0 ? ` (${String(ev.shieldSaves.length)} shield save)` : '';
  pushBanner(
    state,
    `cut-${String(ev.stageIndex)}-${String(state.lastCut.number)}`,
    `Cut: ${String(ev.eliminated.length)} eliminated, ${String(ev.survivors.length)} survive${shield}`,
  );
}

function cutOutcome(id: string, eliminated: Set<string>, saved: Set<string>): CutOutcome {
  if (eliminated.has(id)) return 'eliminated';
  return saved.has(id) ? 'saved' : 'survived';
}

function roundEndText(ev: Extract<DomainEventLike, { type: 'roundEnded' }>): string {
  return `Round ${String(ev.roundIndex + 1)} ended (${ev.reason})`;
}

function applyScoring(state: FoldState, ev: DomainEventLike): void {
  switch (ev.type) {
    case 'cellMarked':
      update(state, ev.accountId, (p) => markCell(p, ev.cardIndex, ev.cellIndex, ev.markPoints));
      return;
    case 'seasonActivated':
      update(state, ev.accountId, (p) => ({
        ...p,
        points: p.points + ev.instantPoints,
        seasonsActivated: p.seasonsActivated + 1,
      }));
      return;
    case 'patternScored':
      addPoints(state, ev.accountId, ev.points);
      return;
    case 'seasonCompleteFired':
      addPoints(state, ev.accountId, ev.points);
      pushBanner(state, `sc-${ev.accountId}`, `Season Complete fired for ${ev.accountId}!`);
      return;
    case 'jackpotClaimed':
      addPoints(state, ev.accountId, ev.value);
      pushBanner(
        state,
        `jp-${ev.accountId}`,
        `Jackpot claimed by ${ev.accountId} (+${String(ev.value)})`,
      );
      return;
    case 'classicPrizeAwarded':
      addPrizeWinner(state, ev.prizeKey, ev.accountId, ev.drawIndex + 1);
      pushBanner(
        state,
        `cp-${ev.prizeKey}-${ev.accountId}`,
        `${ev.prizeKey} awarded to ${ev.accountId} on draw ${String(ev.drawIndex + 1)}`,
      );
      return;
    default:
      return;
  }
}

function markCell(p: PlayerView, cardIndex: number, cellIndex: number, points: number): PlayerView {
  const marks = p.marks.map((m, i) => {
    if (i !== cardIndex) return m;
    const next = m.slice();
    next[cellIndex] = true;
    return next;
  });
  return { ...p, marks, points: p.points + points };
}

function addPrizeWinner(state: FoldState, prizeKey: string, id: string, drawNumber: number): void {
  const win = state.prizeWinners[prizeKey];
  state.prizeWinners[prizeKey] = {
    drawNumber: win?.drawNumber ?? drawNumber,
    accountIds: [...(win?.accountIds ?? []), id],
  };
}

function addPoints(state: FoldState, id: string, points: number): void {
  update(state, id, (p) => ({ ...p, points: p.points + points }));
}

function update(state: FoldState, id: string, change: (p: PlayerView) => PlayerView): void {
  const p = state.players.get(id);
  if (p !== undefined) state.players.set(id, change(p));
}

function pushBanner(state: FoldState, key: string, text: string): void {
  state.banners.push({ key, text });
}
