/**
 * @file   apps/web/src/playback.ts
 * @module web
 * @brief  Lifecycle playback view-model for the Quick Test (WP-08, 01 §3, §13).
 *
 * Responsibility: convert the server's event stream and the drawIndex the owner is
 *                 currently watching into a view-model: current round/stage banner,
 *                 draws drawn so far, standings, cuts, Season Complete, jackpot. The
 *                 owner's own card is rendered separately from App.tsx so that
 *                 manual-mode taps can override the server's auto marks. Pure.
 * Depends on:     ./types
 * Used by:        ./App
 * Spec:           docs/spec/01-game-design.md §3, §7, §8, §13; docs/spec/15-implementation-plan.md WP-08
 */
import type { DomainEventLike, PlayerSummary, QuickTestResult } from './types.js';

export interface Banner {
  readonly key: string;
  readonly text: string;
}

export interface PlaybackView {
  readonly currentStage: number;
  readonly currentRound: number;
  readonly roundInStage: number;
  readonly drawsSoFar: readonly number[];
  readonly totalDraws: number;
  readonly standings: readonly PlayerSummary[];
  readonly ownerStanding: PlayerSummary | null;
  readonly banners: readonly Banner[];
  readonly ownerEliminated: boolean;
  readonly finished: boolean;
}

// Walk the event list up to and including the current global event index, projecting
// everything the UI needs. The caller passes a step (count of events consumed).
export function playbackAt(result: QuickTestResult, step: number): PlaybackView {
  const state = foldEvents(result, Math.min(step, result.events.length));
  const standings = sortByPoints(state.players);
  const owner = standings.find((p) => p.isOwner) ?? null;
  return {
    currentStage: state.stageIndex,
    currentRound: state.roundIndex,
    roundInStage: state.roundInStage,
    drawsSoFar: state.drawsSoFar,
    totalDraws: state.totalDraws,
    standings,
    ownerStanding: owner,
    banners: state.banners,
    ownerEliminated: owner !== null && state.eliminated.has(owner.accountId),
    finished: state.finished,
  };
}

interface FoldState {
  stageIndex: number;
  roundIndex: number;
  roundInStage: number;
  drawsSoFar: number[];
  totalDraws: number;
  players: Map<string, PlayerSummary>;
  banners: Banner[];
  eliminated: Set<string>;
  finished: boolean;
}

function foldEvents(result: QuickTestResult, step: number): FoldState {
  const state: FoldState = {
    stageIndex: 0,
    roundIndex: 0,
    roundInStage: 0,
    drawsSoFar: [],
    totalDraws: 0,
    players: new Map(result.players.map((p) => [p.accountId, resetPlayer(p)])),
    banners: [],
    eliminated: new Set(),
    finished: false,
  };
  for (let i = 0; i < step; i += 1) {
    const ev = result.events[i];
    if (ev === undefined) continue;
    applyEvent(state, ev);
  }
  return state;
}

function resetPlayer(p: PlayerSummary): PlayerSummary {
  return {
    ...p,
    marks: p.card.cells.map((cell) => cell.kind === 'free'),
    place: 0,
    points: 0,
    seasonsActivated: 0,
    shieldCharges: 0,
  };
}

// Dispatch — keep complexity ≤12 by delegating per group.
function applyEvent(state: FoldState, ev: DomainEventLike): void {
  if (applyLifecycle(state, ev)) return;
  applyScoring(state, ev);
}

function applyLifecycle(state: FoldState, ev: DomainEventLike): boolean {
  switch (ev.type) {
    case 'stageStarted':
      state.stageIndex = ev.stageIndex;
      state.roundInStage = 0;
      return true;
    case 'roundStarted':
      state.roundIndex = ev.roundIndex;
      state.roundInStage = ev.roundInStage;
      state.drawsSoFar = [];
      state.totalDraws = ev.drawSequence.length;
      return true;
    case 'drawMade':
      state.drawsSoFar.push(ev.item);
      return true;
    case 'cutApplied':
      for (const id of ev.eliminated) state.eliminated.add(id);
      state.banners.push({
        key: `cut-${String(ev.stageIndex)}`,
        text: `Cut: ${String(ev.eliminated.length)} eliminated, ${String(ev.survivors.length)} survive${ev.shieldSaves.length > 0 ? ` (${String(ev.shieldSaves.length)} shield save)` : ''}`,
      });
      return true;
    case 'roundEnded':
      state.banners.push({
        key: `round-end-${String(ev.roundIndex)}`,
        text: `Round ${String(ev.roundIndex + 1)} ended (${ev.reason})`,
      });
      return true;
    case 'matchFinished':
      state.finished = true;
      return true;
    case 'matchAborted':
      state.banners.push({ key: 'aborted', text: `Match aborted: ${ev.reason}` });
      return true;
    default:
      return false;
  }
}

function applyScoring(state: FoldState, ev: DomainEventLike): void {
  if (ev.type === 'cellMarked') markCell(state, ev.accountId, ev.cellIndex, ev.markPoints);
  else if (ev.type === 'seasonActivated') activateSeason(state, ev.accountId, ev.instantPoints);
  else if (ev.type === 'patternScored') addPoints(state, ev.accountId, ev.points);
  else if (ev.type === 'seasonCompleteFired') addSeasonComplete(state, ev.accountId, ev.points);
  else if (ev.type === 'jackpotClaimed') addJackpot(state, ev.accountId, ev.value);
  else if (ev.type === 'classicPrizeAwarded') addClassicPrize(state, ev.accountId, ev.prizeKey);
}

function markCell(state: FoldState, accountId: string, cellIndex: number, points: number): void {
  const p = state.players.get(accountId);
  if (p === undefined) return;
  const marks = p.marks.slice();
  marks[cellIndex] = true;
  state.players.set(accountId, { ...p, marks, points: p.points + points });
}

function activateSeason(state: FoldState, accountId: string, instantPoints: number): void {
  const p = state.players.get(accountId);
  if (p === undefined) return;
  state.players.set(accountId, {
    ...p,
    points: p.points + instantPoints,
    seasonsActivated: p.seasonsActivated + 1,
  });
}

function addPoints(state: FoldState, accountId: string, points: number): void {
  const p = state.players.get(accountId);
  if (p === undefined) return;
  state.players.set(accountId, { ...p, points: p.points + points });
}

function addSeasonComplete(state: FoldState, accountId: string, points: number): void {
  const p = state.players.get(accountId);
  if (p === undefined) return;
  state.players.set(accountId, { ...p, points: p.points + points });
  state.banners.push({ key: `sc-${accountId}`, text: `Season Complete fired for ${accountId}!` });
}

function addJackpot(state: FoldState, accountId: string, value: number): void {
  const p = state.players.get(accountId);
  if (p === undefined) return;
  state.players.set(accountId, { ...p, points: p.points + value });
  state.banners.push({
    key: `jp-${accountId}`,
    text: `Jackpot claimed by ${accountId} (+${String(value)})`,
  });
}

function addClassicPrize(state: FoldState, accountId: string, prizeKey: string): void {
  state.banners.push({
    key: `cp-${prizeKey}-${accountId}`,
    text: `${prizeKey} awarded to ${accountId}`,
  });
}

function sortByPoints(players: Map<string, PlayerSummary>): PlayerSummary[] {
  return [...players.values()].sort(
    (a, b) => b.points - a.points || a.accountId.localeCompare(b.accountId),
  );
}
