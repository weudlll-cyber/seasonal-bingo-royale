/**
 * @file   apps/web/src/playbackScoring.ts
 * @module web
 * @brief  The playback fold's state and its scoring events (WP-08, 01 §3a, §8).
 *
 * Responsibility: the mutable state ./playback folds the event stream into, the helpers
 *                 that change one player or add a banner, and the scoring events: marks,
 *                 season activations (which seasons a player holds; the owner's as event
 *                 lines), patterns (who completed each first this round, the viewer's own,
 *                 event lines), Season Complete, jackpot and classic prizes. It only adds up
 *                 points the server already computed. Pure.
 * Depends on:     ./playbackTypes, ./game/labels, ./game/seasonText, ./types
 * Used by:        ./playback
 * Spec:           docs/spec/01-game-design.md §3a, §8; docs/spec/15-implementation-plan.md WP-08
 */
import {
  decidedAt,
  jackpotLine,
  patternLine,
  prizeLine,
  seasonCompleteLine,
} from './game/labels.js';
import { ownSeasonLine } from './game/seasonText.js';
import type { Banner, CutView, PlayerView, PrizeWin, RoundPattern } from './playbackTypes.js';
import type { DomainEventLike, QuickTestResult } from './types.js';

export interface FoldState {
  stageIndex: number;
  roundIndex: number;
  // The stage the current (or just ended) round belongs to; the next stage may already
  // have begun while its first round has not.
  roundStage: number;
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
  // The patterns completed in the current round (first and the viewer's own).
  roundPatterns: Record<string, RoundPattern>;
  // The server's facts the fold reads: season effects, what each cut did.
  readonly facts: Pick<QuickTestResult, 'seasonEffects' | 'cuts'>;
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
      if (state.players.get(ev.accountId)?.isOwner === true) {
        const effect = state.facts.seasonEffects[ev.season];
        pushBanner(
          state,
          `season-${String(state.roundIndex)}-${ev.season}`,
          ownSeasonLine(ev, effect),
        );
      }
      return;
    case 'patternScored':
      addPoints(state, ev.accountId, ev.points);
      state.lastScorer = ev.accountId;
      notePattern(state, ev);
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

// Who completed the pattern first this round, whether the viewer has it, and the line.
function notePattern(state: FoldState, ev: Extract<DomainEventLike, { type: 'patternScored' }>) {
  const was = state.roundPatterns[ev.prizeKey] ?? { first: null, mine: false };
  state.roundPatterns[ev.prizeKey] = {
    first: was.first ?? (ev.firstInRound ? ev.accountId : null),
    mine: was.mine || state.players.get(ev.accountId)?.isOwner === true,
  };
  pushBanner(
    state,
    `pt-${String(state.roundIndex)}-${ev.prizeKey}-${ev.accountId}-${String(ev.cardIndex)}`,
    patternLine(ev.accountId, ev.prizeKey, ev.points, ev.firstInRound),
  );
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

function addPoints(state: FoldState, id: string, points: number): void {
  update(state, id, (p) => ({ ...p, points: p.points + points }));
}

export function update(state: FoldState, id: string, change: (p: PlayerView) => PlayerView): void {
  const p = state.players.get(id);
  if (p !== undefined) state.players.set(id, change(p));
}

export function pushBanner(state: FoldState, key: string, text: string): void {
  state.banners.push({ key, text });
}
