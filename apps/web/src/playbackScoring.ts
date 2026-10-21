/**
 * @file   apps/web/src/playbackScoring.ts
 * @module web
 * @brief  The playback fold's state and its scoring events (WP-08, 01 §3a, §8).
 *
 * Responsibility: the mutable state ./playback folds the event stream into, the helpers
 *                 that change one player or add a banner, and the scoring events: marks,
 *                 season activations (which seasons a player holds), patterns, Season
 *                 Complete, jackpot and classic prizes. It only adds up points the server
 *                 already computed. Pure.
 * Depends on:     ./playbackTypes, ./game/labels, ./types
 * Used by:        ./playback
 * Spec:           docs/spec/01-game-design.md §3a, §8; docs/spec/15-implementation-plan.md WP-08
 */
import { decidedAt, jackpotLine, prizeLine, seasonCompleteLine } from './game/labels.js';
import type { Banner, CutView, PlayerView, PrizeWin } from './playbackTypes.js';
import type { DomainEventLike } from './types.js';

export interface FoldState {
  stageIndex: number;
  roundIndex: number;
  drawsSoFar: number[];
  totalDraws: number;
  players: Map<string, PlayerView>;
  banners: Banner[];
  lastCut: CutView | null;
  prizeWinners: Record<string, PrizeWin>;
  roundOver: boolean;
  finished: boolean;
  // The player of the round's latest pattern: names who ended a round (firstFullHouse …).
  lastScorer: string | null;
}

export function applyScoring(state: FoldState, ev: DomainEventLike): void {
  switch (ev.type) {
    case 'cellMarked':
      update(state, ev.accountId, (p) => markCell(p, ev.cardIndex, ev.cellIndex, ev.markPoints));
      return;
    case 'seasonActivated':
      update(state, ev.accountId, (p) => ({
        ...p,
        points: p.points + ev.instantPoints,
        seasonsActivated: p.seasonsActivated + 1,
        seasons: p.seasons.includes(ev.season) ? p.seasons : [...p.seasons, ev.season],
      }));
      return;
    case 'patternScored':
      addPoints(state, ev.accountId, ev.points);
      state.lastScorer = ev.accountId;
      return;
    case 'seasonCompleteFired':
      addPoints(state, ev.accountId, ev.points);
      pushBanner(state, `sc-${ev.accountId}`, seasonCompleteLine(ev.accountId));
      return;
    case 'jackpotClaimed':
      addPoints(state, ev.accountId, ev.value);
      pushBanner(state, `jp-${ev.accountId}`, jackpotLine(ev.accountId, ev.value));
      return;
    case 'classicPrizeAwarded': {
      // The deciding ball, e.g. "draw 37 (G 52)" (D7).
      const item = state.drawsSoFar[ev.drawIndex] ?? 0;
      addPrizeWinner(state, ev.prizeKey, ev.accountId, decidedAt(ev.drawIndex, item));
      pushBanner(
        state,
        `cp-${ev.prizeKey}-${ev.accountId}`,
        prizeLine(ev.prizeKey, ev.accountId, ev.drawIndex, item),
      );
      return;
    }
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

function addPrizeWinner(state: FoldState, prizeKey: string, id: string, decided: string): void {
  const win = state.prizeWinners[prizeKey];
  state.prizeWinners[prizeKey] = {
    decided: win?.decided ?? decided,
    accountIds: [...(win?.accountIds ?? []), id],
  };
}

export function addPoints(state: FoldState, id: string, points: number): void {
  update(state, id, (p) => ({ ...p, points: p.points + points }));
}

export function update(state: FoldState, id: string, change: (p: PlayerView) => PlayerView): void {
  const p = state.players.get(id);
  if (p !== undefined) state.players.set(id, change(p));
}

export function pushBanner(state: FoldState, key: string, text: string): void {
  state.banners.push({ key, text });
}
