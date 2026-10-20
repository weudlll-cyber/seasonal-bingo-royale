/**
 * @file   packages/domain/src/match/evolveScoring.ts
 * @module domain/match
 * @brief  Per-score event handlers extracted from evolve.ts (01 §8.1–§8.5).
 *
 * Responsibility: fold the scoring events (`cellMarked`, `seasonActivated`,
 *                 `patternScored`, `classicPrizeAwarded`, `seasonCompleteFired`,
 *                 `jackpotClaimed`) into the match state. Kept here so evolve.ts stays
 *                 within the 300-line limit. Pure.
 * Depends on:     ../seasons/applyEffect, ./matchState, ./events
 * Used by:        ./evolve
 * Spec:           docs/spec/01-game-design.md §8.1–§8.5
 */
import { applyEffect } from '../seasons/applyEffect.js';
import type { MatchState, PlayerState } from './matchState.js';
import type { DomainEvent } from './events.js';

export function onCellMarked(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'cellMarked' }>,
): MatchState {
  const round = state.currentRound;
  const cards = round?.cards[ev.accountId];
  const target = cards?.[ev.cardIndex];
  const player = state.players[ev.accountId];
  if (round === null || cards === undefined || target === undefined || player === undefined)
    return state;
  const marks = target.marks.slice();
  marks[ev.cellIndex] = true;
  const newCards = cards.slice();
  newCards[ev.cardIndex] = { ...target, marks };
  const lastDraw = ev.markPoints > 0 ? Math.max(0, round.draws.length - 1) : player.lastScoringDraw;
  // Growth non-stacking bump: a mark inside the growth window increments nthMark.
  const newGrowth =
    player.effects.growth === null
      ? player.effects.growth
      : { ...player.effects.growth, nthMark: player.effects.growth.nthMark + 1 };
  return {
    ...state,
    currentRound: { ...round, cards: { ...round.cards, [ev.accountId]: newCards } },
    players: {
      ...state.players,
      [ev.accountId]: {
        ...player,
        points: player.points + ev.markPoints,
        lastScoringDraw: lastDraw,
        effects: { ...player.effects, growth: newGrowth },
      },
    },
  };
}

export function onSeasonActivated(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'seasonActivated' }>,
): MatchState {
  const p = state.players[ev.accountId];
  if (p === undefined) return state;
  const effect = state.ruleset.seasons[ev.season].effect;
  const applied = applyEffect(p.effects, effect, { markedCellsInScope: 0 });
  const bit =
    ev.season === 'spring' ? 1 : ev.season === 'summer' ? 2 : ev.season === 'autumn' ? 4 : 8;
  const effects = { ...applied.state, seasonsActivated: applied.state.seasonsActivated | bit };
  const shieldRankMargin = effect.type === 'shield' ? effect.rankMargin : p.shieldRankMargin;
  const lastScoringDraw =
    ev.instantPoints > 0
      ? Math.max(0, (state.currentRound?.draws.length ?? 1) - 1)
      : p.lastScoringDraw;
  return {
    ...state,
    players: {
      ...state.players,
      [ev.accountId]: {
        ...p,
        points: p.points + ev.instantPoints,
        lastScoringDraw,
        effects,
        shieldRankMargin,
      },
    },
  };
}

export function onPatternScored(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'patternScored' }>,
): MatchState {
  const round = state.currentRound;
  if (round === null) return state;
  const player = state.players[ev.accountId];
  const cards = round.cards[ev.accountId];
  const target = cards?.[ev.cardIndex];
  if (player === undefined || cards === undefined || target === undefined) return state;
  const drawIndex = Math.max(0, round.draws.length - 1);
  const firstToPrize =
    round.firstToPrize[ev.prizeKey] === undefined
      ? { ...round.firstToPrize, [ev.prizeKey]: { accountId: ev.accountId, drawIndex } }
      : round.firstToPrize;
  const newCards = cards.slice();
  newCards[ev.cardIndex] = { ...target, scoredPrizes: [...target.scoredPrizes, ev.prizeKey] };
  const fullHouseBy =
    ev.prizeKey === 'fullCard' && !round.fullHouseBy.includes(ev.accountId)
      ? [...round.fullHouseBy, ev.accountId]
      : round.fullHouseBy;
  const nextPlayer: PlayerState = {
    ...player,
    points: player.points + ev.points,
    patternsCount: player.patternsCount + 1,
    lastScoringDraw: drawIndex,
  };
  return {
    ...state,
    currentRound: {
      ...round,
      firstToPrize,
      fullHouseBy,
      cards: { ...round.cards, [ev.accountId]: newCards },
    },
    players: { ...state.players, [ev.accountId]: nextPlayer },
  };
}

export function onClassicPrize(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'classicPrizeAwarded' }>,
): MatchState {
  const round = state.currentRound;
  if (round === null) return state;
  const already = round.classicAwards.some(
    (a) => a.prizeKey === ev.prizeKey && a.accountId === ev.accountId,
  );
  if (already) return state;
  return {
    ...state,
    currentRound: {
      ...round,
      classicAwards: [
        ...round.classicAwards,
        { prizeKey: ev.prizeKey, accountId: ev.accountId, drawIndex: ev.drawIndex },
      ],
    },
  };
}

export function onSeasonComplete(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'seasonCompleteFired' }>,
): MatchState {
  const round = state.currentRound;
  const p = state.players[ev.accountId];
  if (p === undefined || round === null) return state;
  const effect = state.ruleset.seasonComplete.effect;
  const applied = applyEffect(p.effects, effect, { markedCellsInScope: 0 });
  return {
    ...state,
    players: {
      ...state.players,
      [ev.accountId]: {
        ...p,
        points: p.points + ev.points,
        seasonCompleteFired: true,
        seasonCompleteRound: round.roundIndex,
        effects: applied.state,
      },
    },
  };
}

export function onJackpotClaimed(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'jackpotClaimed' }>,
): MatchState {
  const p = state.players[ev.accountId];
  if (p === undefined) return state;
  return {
    ...state,
    jackpot: {
      unclaimedRounds: state.jackpot.unclaimedRounds,
      claimedBy: ev.accountId,
      claimedAtRound: ev.roundIndex,
      value: ev.value,
    },
    players: { ...state.players, [ev.accountId]: { ...p, points: p.points + ev.value } },
  };
}
