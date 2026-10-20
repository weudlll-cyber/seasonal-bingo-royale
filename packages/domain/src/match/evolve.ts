/**
 * @file   packages/domain/src/match/evolve.ts
 * @module domain/match
 * @brief  Fold a domain event into the match state (02 §5.1, invariant 4).
 *
 * Responsibility: left fold event → state. Replay (`events.reduce(evolve, INITIAL)`)
 *                 must reproduce the live state produced by decide + evolve interleaved
 *                 (invariant 4 of 12 §3). The actual field updates live in
 *                 ./evolveLifecycle.ts and ./evolveScoring.ts; this file is only the
 *                 dispatch map and the initial-state factory. Pure.
 * Depends on:     ./matchState, ./events, ./lifecycleTypes, ./evolveLifecycle, ./evolveScoring
 * Used by:        apps/server (projection), ./decide, ./simulate, tests
 * Spec:           docs/spec/02-software-architecture.md §5.1, docs/spec/12-testing-strategy.md §3 inv. 4
 */
import type { MatchState } from './matchState.js';
import type { DomainEvent } from './events.js';
import type { MatchRuleset } from './lifecycleTypes.js';
import {
  onLobbyOpened,
  onPlayerJoined,
  onStageStarted,
  onRoundStarted,
  onDrawMade,
  onRoundEnded,
  onSpeedWindowClosed,
  onCutApplied,
  onMatchFinished,
} from './evolveLifecycle.js';
import {
  onCellMarked,
  onSeasonActivated,
  onPatternScored,
  onClassicPrize,
  onSeasonComplete,
  onJackpotClaimed,
} from './evolveScoring.js';

// Sentinel ruleset so projection of events can start without a lobbyOpened event
// having been applied yet. The first `lobbyOpened` overwrites every field.
const EMPTY_RULESET: MatchRuleset = Object.freeze({
  mode: 'realtime',
  markingMode: 'auto',
  missedNumbers: { kind: 'noAutoMark' },
  cardsPerPlayer: 1,
  freeCenter: true,
  pointsPerMark: 0,
  firstToPatternBonusPercent: 0,
  pointsByPrizeKey: Object.freeze({}),
  seasons: Object.freeze({
    spring: { effect: { type: 'none' } },
    summer: { effect: { type: 'none' } },
    autumn: { effect: { type: 'none' } },
    winter: { effect: { type: 'none' } },
  }),
  seasonComplete: { points: 0, effect: { type: 'none' } },
  jackpot: { base: 0, growthPerRound: 0 },
  stages: [],
}) as MatchRuleset;

export function createInitialMatchState(): MatchState {
  return {
    matchId: '',
    gameType: 'royale',
    ruleset: EMPTY_RULESET,
    seed: new Uint8Array(0),
    phase: 'lobby',
    stagePlan: [],
    stageIndex: 0,
    roundInStage: 0,
    roundIndex: 0,
    players: {},
    playerOrder: [],
    currentRound: null,
    jackpot: { unclaimedRounds: 0, claimedBy: null, claimedAtRound: null, value: 0 },
    tickedPrizes: [],
    finalPlacement: [],
  };
}

// A dispatch map keeps `evolve` at complexity 1 and lets each handler stay typed to
// its event variant.
type Projector<K extends DomainEvent['type']> = (
  state: MatchState,
  event: Extract<DomainEvent, { type: K }>,
) => MatchState;
type Projectors = { readonly [K in DomainEvent['type']]: Projector<K> };

const projectors: Projectors = {
  lobbyOpened: onLobbyOpened,
  playerJoined: onPlayerJoined,
  matchStarted: (s, _e) => ({ ...s, phase: 'running' }),
  stageStarted: (s, e) => onStageStarted(s, e.stageIndex),
  roundStarted: onRoundStarted,
  drawMade: (s, _e) => onDrawMade(s),
  speedWindowClosed: (s, e) => onSpeedWindowClosed(s, e.drawIndex),
  cellMarked: onCellMarked,
  seasonActivated: onSeasonActivated,
  patternScored: onPatternScored,
  classicPrizeAwarded: onClassicPrize,
  seasonCompleteFired: onSeasonComplete,
  jackpotClaimed: onJackpotClaimed,
  roundEnded: (s, _e) => onRoundEnded(s),
  cutApplied: onCutApplied,
  matchFinished: onMatchFinished,
  matchAborted: (s, _e) => ({ ...s, phase: 'aborted' }),
};

export function evolve(state: MatchState, event: DomainEvent): MatchState {
  const projector = projectors[event.type] as (s: MatchState, e: DomainEvent) => MatchState;
  return projector(state, event);
}
