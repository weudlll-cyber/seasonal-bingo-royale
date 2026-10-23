/**
 * @file   packages/domain/src/match/decide.ts
 * @module domain/match
 * @brief  Decide function: command + state (+ ctx) → events (02 §5.1).
 *
 * Responsibility: pure dispatcher. One helper per command tag; the non-trivial ones
 *                 (startRound, drawNext, autoMarkMissed, applyCut, finishMatch) live
 *                 in sibling files to stay under the 300-line limit. The dispatch map
 *                 keeps complexity at 1. All randomness comes from state.seed; ctx
 *                 carries only the clock, which the realtime engine uses for speed
 *                 bonuses outside this pure function.
 * Depends on:     ../draw/drawSequence, ../royale/cut, ../royale/finalRanking, ./markResolver,
 *                 ./evolve, ./matchState, ./commands, ./events, ./stagePlan, ./roundEnd,
 *                 ./decideCards, ./decideAutoMark, ./decideRanking
 * Used by:        ./simulate, ../index, packages/application (match engine)
 * Spec:           docs/spec/01-game-design.md §3, §6, §7, §8; docs/spec/02-software-architecture.md §5.1
 */
import { drawSequence } from '../draw/drawSequence.js';
import { applyCut } from '../royale/cut.js';
import { finalRanking } from '../royale/finalRanking.js';
import { buildStagePlan } from './stagePlan.js';
import { royaleEndReason, classicEndReason } from './roundEnd.js';
import { buildMarkEvents } from './markResolver.js';
import { evolve } from './evolve.js';
import { buildCards } from './decideCards.js';
import { autoMarksForItem, tapsOwnMarks } from './decideAutoMark.js';
import {
  activeAccountIds,
  candidateOf,
  classicFinalPlacement,
  rankedPlayerOf,
} from './decideRanking.js';
import type { MatchState } from './matchState.js';
import type {
  AbortMatch,
  AutoMarkMissed,
  CloseSpeedWindow,
  Command,
  JoinMatch,
  MarkCell,
  OpenLobby,
} from './commands.js';
import type {
  CutApplied,
  DomainEvent,
  LobbyOpened,
  MatchFinished,
  MatchStarted,
  PlayerJoined,
  RoundEnded,
  RoundStarted,
  StageStarted,
} from './events.js';

export interface DecideCtx {
  readonly now: number;
}

// A dispatch map keeps `decide` at complexity 1 and lets every handler stay typed to
// its command variant. The caller passes a Command value; the map looks up the handler
// by its `type` tag.
type Handler<K extends Command['type']> = (
  state: MatchState,
  command: Extract<Command, { type: K }>,
  ctx: DecideCtx,
) => readonly DomainEvent[];
type Dispatch = { readonly [K in Command['type']]: Handler<K> };

const dispatch: Dispatch = {
  openLobby: (_s, c) => onOpenLobby(c),
  joinMatch: (s, c) => onJoin(s, c),
  startMatch: (s, _c) => onStartMatch(s),
  startStage: (s, _c) => onStartStage(s),
  startRound: (s, _c) => onStartRound(s),
  drawNext: (s, _c) => onDrawNext(s),
  markCell: (s, c) => onMark(s, c),
  autoMarkMissed: (s, c) => onAutoMarkMissed(s, c),
  closeSpeedWindow: (s, c) => onCloseSpeedWindow(s, c),
  endRound: (s, _c) => onEndRound(s),
  applyCut: (s, _c) => onApplyCut(s),
  finishMatch: (s, _c) => onFinish(s),
  // Only while the match runs and no round is in play (the pause after a round).
  scheduleNextRound: (s, c) =>
    s.phase === 'running' && (s.currentRound === null || s.currentRound.ended)
      ? [{ type: 'nextRoundScheduled', at: c.at }]
      : [],
  abortMatch: (s, c) => (s.phase === 'finished' || s.phase === 'aborted' ? [] : onAbort(c)),
};

export function decide(
  state: MatchState,
  command: Command,
  ctx: DecideCtx,
): readonly DomainEvent[] {
  const handler = dispatch[command.type] as (
    s: MatchState,
    c: Command,
    ctx: DecideCtx,
  ) => readonly DomainEvent[];
  return handler(state, command, ctx);
}

function onOpenLobby(cmd: OpenLobby): readonly DomainEvent[] {
  const ev: LobbyOpened = {
    type: 'lobbyOpened',
    matchId: cmd.matchId,
    gameType: cmd.gameType,
    ruleset: cmd.ruleset,
    seed: cmd.seed,
    stagePlan: buildStagePlan(cmd.gameType, cmd.ruleset),
    tickedPrizes: cmd.tickedPrizes,
  };
  return [ev];
}

function onJoin(state: MatchState, cmd: JoinMatch): readonly DomainEvent[] {
  if (state.phase !== 'lobby') return [];
  if (state.players[cmd.accountId] !== undefined) return [];
  const ev: PlayerJoined = {
    type: 'playerJoined',
    accountId: cmd.accountId,
    joinedAt: cmd.joinedAt,
    ...(cmd.human === true ? { human: true } : {}),
  };
  return [ev];
}

function onStartMatch(state: MatchState): readonly DomainEvent[] {
  if (state.phase !== 'lobby') return [];
  return [
    { type: 'matchStarted' } satisfies MatchStarted,
    { type: 'stageStarted', stageIndex: 0 } satisfies StageStarted,
  ];
}

function onStartStage(state: MatchState): readonly DomainEvent[] {
  if (state.phase !== 'running') return [];
  if (state.stageIndex + 1 >= state.stagePlan.length) return [];
  return [{ type: 'stageStarted', stageIndex: state.stageIndex + 1 } satisfies StageStarted];
}

function onStartRound(state: MatchState): readonly DomainEvent[] {
  if (state.phase !== 'running') return [];
  if (state.currentRound !== null && !state.currentRound.ended) return [];
  const stage = state.stagePlan[state.stageIndex];
  if (stage === undefined) return [];
  const activeIds = activeAccountIds(state);
  if (activeIds.length === 0) return [];
  const nextRoundIndex = state.currentRound === null ? state.roundIndex : state.roundIndex + 1;
  const ev: RoundStarted = {
    type: 'roundStarted',
    roundIndex: nextRoundIndex,
    stageIndex: state.stageIndex,
    roundInStage: state.roundInStage,
    drawSequence: drawSequence({
      seed: state.seed,
      matchId: state.matchId,
      roundIndex: nextRoundIndex,
      gameType: state.gameType,
    }),
    cardsByPlayer: buildCards(state, activeIds, nextRoundIndex),
  };
  return [ev];
}

function onDrawNext(state: MatchState): readonly DomainEvent[] {
  const round = state.currentRound;
  if (round === null || round.ended || state.phase !== 'running') return [];
  if (round.draws.length >= round.drawSequence.length) return [];
  const nextIndex = round.draws.length;
  const item = round.drawSequence[nextIndex];
  if (item === undefined) return [];
  const drawEvent: DomainEvent = { type: 'drawMade', drawIndex: nextIndex, item };
  // Marking mode is per player (01 §6): bots and auto-mode players are marked on the
  // draw; tapping players get nothing here and mark through markCell/autoMarkMissed.
  const projected = evolve(state, drawEvent);
  const auto = autoMarksForItem(projected, item, (id) => !tapsOwnMarks(state, id));
  return [drawEvent, ...auto.events];
}

function onMark(state: MatchState, cmd: MarkCell): readonly DomainEvent[] {
  if (!tapsOwnMarks(state, cmd.accountId)) return [];
  // A tap is accepted until the round ends, so the round end closes every open tap.
  const round = state.currentRound;
  if (round === null || round.ended || state.phase !== 'running') return [];
  const marks = round.cards[cmd.accountId]?.[cmd.cardIndex];
  const cell = marks?.card.cells[cmd.cellIndex];
  if (marks === undefined || cell === undefined) return [];
  if (marks.marks[cmd.cellIndex] === true) return [];
  if (cell.kind === 'free') return [];
  // The item must have been drawn in this round (01 §6, anti-cheat 12 §6).
  if (!round.draws.includes(cell.value)) return [];
  return buildMarkEvents(state, cmd);
}

// The missed-number delay after draw `drawIndex` has passed: mark the tapping players'
// still-open cells for that item without bonus. Under noAutoMark they stay open (01 §6).
function onAutoMarkMissed(state: MatchState, cmd: AutoMarkMissed): readonly DomainEvent[] {
  if (state.ruleset.missedNumbers.kind !== 'autoMarkAfter') return [];
  const round = state.currentRound;
  if (round === null || round.ended || state.phase !== 'running') return [];
  const item = round.draws[cmd.drawIndex];
  if (item === undefined) return [];
  return autoMarksForItem(state, item, (id) => tapsOwnMarks(state, id)).events;
}

// The speed window of the latest draw closes (D10); later windows only, never twice.
function onCloseSpeedWindow(state: MatchState, cmd: CloseSpeedWindow): readonly DomainEvent[] {
  const round = state.currentRound;
  if (round === null || round.ended || state.phase !== 'running') return [];
  if (cmd.drawIndex !== round.draws.length - 1 || cmd.drawIndex <= round.windowClosedThrough) {
    return [];
  }
  return [{ type: 'speedWindowClosed', drawIndex: cmd.drawIndex }];
}

function onEndRound(state: MatchState): readonly DomainEvent[] {
  const round = state.currentRound;
  if (round === null || round.ended) return [];
  // A round never ends at the moment of a draw: only once the speed window of its last
  // draw has closed, so that number can still be tapped (01 §6, D10).
  if (round.windowClosedThrough < round.draws.length - 1) return [];
  const activeCount = activeAccountIds(state).length;
  const reason =
    state.gameType === 'royale'
      ? royaleEndReason(round, activeCount, round.stage.roundEnd)
      : classicEndReason(round);
  if (reason === null) return [];
  const ev: RoundEnded = { type: 'roundEnded', roundIndex: round.roundIndex, reason };
  return [ev];
}

function onApplyCut(state: MatchState): readonly DomainEvent[] {
  if (state.gameType !== 'royale') return [];
  const round = state.currentRound;
  if (round === null || !round.ended) return [];
  const stage = round.stage;
  if (stage.cut === undefined) return [];
  const activeIds = activeAccountIds(state);
  if (activeIds.length <= stage.cut.minSurvivors) return [];
  const candidates = activeIds.map((id) => candidateOf(state, id));
  const r = applyCut(candidates, stage.cut);
  const ev: CutApplied = {
    type: 'cutApplied',
    stageIndex: state.stageIndex,
    survivors: r.survivors,
    eliminated: r.eliminated,
    shieldSaves: r.shieldSaves,
  };
  return [ev];
}

function onFinish(state: MatchState): readonly DomainEvent[] {
  if (state.phase === 'finished') return [];
  if (state.gameType !== 'royale') {
    return [{ type: 'matchFinished', placement: classicFinalPlacement(state) }];
  }
  const ranked = state.playerOrder.map((id) => rankedPlayerOf(state, id));
  const ev: MatchFinished = { type: 'matchFinished', placement: finalRanking(ranked) };
  return [ev];
}

function onAbort(cmd: AbortMatch): readonly DomainEvent[] {
  return [{ type: 'matchAborted', reason: cmd.reason, by: cmd.by }];
}
