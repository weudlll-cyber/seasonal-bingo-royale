/**
 * @file   packages/domain/src/match/evolveLifecycle.ts
 * @module domain/match
 * @brief  Lifecycle event handlers extracted from evolve.ts (02 §5.1).
 *
 * Responsibility: fold lobby/match/stage/round/cut events into the match state.
 *                 Kept here to keep evolve.ts under the 300-line limit. Pure.
 * Depends on:     ../seasons/tickEffects, ./matchState, ./events, ./lifecycleTypes
 * Used by:        ./evolve
 * Spec:           docs/spec/02-software-architecture.md §5.1, docs/spec/01-game-design.md §7
 */
import { onDraw } from '../seasons/tickEffects.js';
import {
  initialPlayerState,
  type MatchState,
  type PlayerState,
  type RoundState,
} from './matchState.js';
import type { DomainEvent, RoundStarted } from './events.js';
import type { StagePlanEntry } from './lifecycleTypes.js';

export function onLobbyOpened(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'lobbyOpened' }>,
): MatchState {
  return {
    ...state,
    matchId: ev.matchId,
    gameType: ev.gameType,
    ruleset: ev.ruleset,
    seed: ev.seed,
    stagePlan: ev.stagePlan,
    tickedPrizes: ev.tickedPrizes,
    phase: 'lobby',
    jackpot: {
      unclaimedRounds: 0,
      claimedBy: null,
      claimedAtRound: null,
      value: ev.ruleset.jackpot.base,
    },
  };
}

export function onPlayerJoined(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'playerJoined' }>,
): MatchState {
  if (state.players[ev.accountId] !== undefined) return state;
  return {
    ...state,
    players: { ...state.players, [ev.accountId]: initialPlayerState(ev.accountId, ev.joinedAt) },
    playerOrder: [...state.playerOrder, ev.accountId],
  };
}

export function onStageStarted(state: MatchState, stageIndex: number): MatchState {
  const stage = state.stagePlan[stageIndex];
  if (stage === undefined) return state;
  const next = applyScoreCarry(state, stage);
  return { ...next, stageIndex, roundInStage: 0 };
}

function applyScoreCarry(state: MatchState, stage: StagePlanEntry): MatchState {
  if (stage.scoreCarry.kind === 'keep') return state;
  const factor = stage.scoreCarry.kind === 'scaled' ? stage.scoreCarry.factor : 0;
  // Only players still in the match carry points into the stage; eliminated players keep
  // their score at elimination, which places them in the final ranking (01 §7.5).
  const nextPlayers: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(state.players)) {
    nextPlayers[id] =
      p.eliminatedAtRound === null ? { ...p, points: Math.round(p.points * factor) } : p;
  }
  return { ...state, players: nextPlayers };
}

export function onRoundStarted(state: MatchState, ev: RoundStarted): MatchState {
  const stage = state.stagePlan[ev.stageIndex];
  if (stage === undefined) return state;
  const cards: Record<string, RoundState['cards'][string]> = {};
  for (const [accountId, playerCards] of Object.entries(ev.cardsByPlayer)) {
    cards[accountId] = playerCards.map((card) => ({
      card,
      marks: card.cells.map((cell) => cell.kind === 'free'),
      scoredPrizes: [],
    }));
  }
  const round: RoundState = {
    roundIndex: ev.roundIndex,
    stageIndex: ev.stageIndex,
    roundInStage: ev.roundInStage,
    stage,
    drawSequence: ev.drawSequence,
    draws: [],
    cards,
    firstToPrize: {},
    fullHouseBy: [],
    classicAwards: [],
    outstandingPrizes: state.gameType === 'royale' ? [] : [...state.tickedPrizes],
    ended: false,
  };
  return { ...state, currentRound: round, roundIndex: ev.roundIndex };
}

export function onDrawMade(state: MatchState): MatchState {
  const round = state.currentRound;
  if (round === null) return state;
  const nextIndex = round.draws.length;
  const item = round.drawSequence[nextIndex];
  if (item === undefined) return state;
  // Tick effect durations for every active player (01 §8.2).
  const nextPlayers: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(state.players)) {
    nextPlayers[id] = p.eliminatedAtRound === null ? { ...p, effects: onDraw(p.effects) } : p;
  }
  return {
    ...state,
    players: nextPlayers,
    currentRound: { ...round, draws: [...round.draws, item] },
  };
}

export function onRoundEnded(state: MatchState): MatchState {
  const round = state.currentRound;
  if (round === null) return state;
  const jackpotWasClaimed =
    state.jackpot.claimedBy !== null && state.jackpot.claimedAtRound === round.roundIndex;
  const nextUnclaimed = jackpotWasClaimed
    ? state.jackpot.unclaimedRounds
    : state.jackpot.unclaimedRounds + 1;
  return {
    ...state,
    currentRound: { ...round, ended: true },
    jackpot: {
      ...state.jackpot,
      unclaimedRounds: nextUnclaimed,
      value: state.ruleset.jackpot.base + state.ruleset.jackpot.growthPerRound * nextUnclaimed,
    },
    roundInStage: state.roundInStage + 1,
  };
}

export function onCutApplied(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'cutApplied' }>,
): MatchState {
  const nextPlayers: Record<string, PlayerState> = { ...state.players };
  for (const id of ev.eliminated) {
    const p = nextPlayers[id];
    if (p !== undefined) nextPlayers[id] = { ...p, eliminatedAtRound: state.roundIndex };
  }
  // Shield saves consume one charge of the saved player's shield.
  for (const id of ev.shieldSaves) {
    const p = nextPlayers[id];
    if (p !== undefined) {
      const charges = Math.max(0, p.effects.shieldCharges - 1);
      nextPlayers[id] = { ...p, effects: { ...p.effects, shieldCharges: charges } };
    }
  }
  return { ...state, players: nextPlayers };
}

export function onMatchFinished(
  state: MatchState,
  ev: Extract<DomainEvent, { type: 'matchFinished' }>,
): MatchState {
  return { ...state, phase: 'finished', finalPlacement: ev.placement };
}
