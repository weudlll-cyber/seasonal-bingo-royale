/**
 * @file   packages/application/src/match/ports.ts
 * @module application/match
 * @brief  Ports of the live match engine: store, scheduler, event bus, clock, maintenance (02 §3, §5).
 *
 * Responsibility: the shapes the engine needs from the outside world. The server adapts
 *                 them to PostgreSQL (event log, projections, scheduled_actions) and to the
 *                 WebSocket gateway; tests can use in-memory fakes. No I/O here.
 * Depends on:     @sbr/contracts, @sbr/domain (types)
 * Used by:        ./engine, apps/server/src/match/*, ../index, ./create, ./fakes, ./flow,
 *                 ./runner, ./startRules
 * Spec:           docs/spec/02-software-architecture.md §3, §5.2–§5.4
 */
import type { Ruleset } from '@sbr/contracts';
import type { DomainEvent, GameType, MarkingMode, MatchState, MissedNumbers } from '@sbr/domain';

export type DrawMode = 'auto' | 'host';
export type MatchStatus = 'lobby' | 'running' | 'finished' | 'aborted';

// The pause between royale rounds (D14): wait the given time, or until the host starts
// the next round.
export type RoundPause = { readonly kind: 'wait'; readonly ms: number } | { readonly kind: 'host' };

// What the starter chose at creation (05 §2.3, 11 §3.2); draw mode and interval change
// during play (D8).
export interface MatchSettings {
  readonly markingMode: MarkingMode;
  readonly missedNumbers: MissedNumbers;
  readonly drawMode: DrawMode;
  readonly drawIntervalMs: number;
  readonly roundPause: RoundPause;
  readonly startRule: StartRule;
}

// How a match starts (01 §7.6, D16): the host presses Start; a set time, announced, at
// which the match starts itself only with `auto` on (the host may always start it); or
// when every place is taken. Each with the same countdown before the first round.
export type StartRule =
  | { readonly kind: 'host' }
  | { readonly kind: 'at'; readonly at: number; readonly auto: boolean }
  | { readonly kind: 'whenFull' };

export interface MatchRecord {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly gameType: GameType;
  readonly rulesetName: string;
  readonly ruleset: Ruleset;
  readonly status: MatchStatus;
  readonly maxPlayers: number;
  readonly prizes: readonly string[];
  readonly countsForLeaderboard: boolean;
  readonly settings: MatchSettings;
  readonly createdBy: string | null;
  readonly startsAt: number | null;
}

export interface NewMatchRecord extends Omit<MatchRecord, 'status' | 'startsAt'> {
  readonly seed: Uint8Array;
}

export interface StoredEvent {
  readonly seq: number;
  readonly event: DomainEvent;
  readonly occurredAt: number;
}

// A match rebuilt from its snapshot and event tail, plus the time of every draw of the
// current round (the speed bonus and the missed-number delay run from it).
export interface LoadedMatch {
  readonly record: MatchRecord;
  readonly state: MatchState;
  readonly seq: number;
  readonly drawTimes: readonly number[];
}

// How a mark came about, for the marks projection (04 §3.3).
export interface MarkContext {
  readonly source: 'manual' | 'auto';
  readonly speedBonus: number;
}

export interface AppendInput {
  readonly matchId: string;
  readonly expectedSeq: number;
  readonly events: readonly DomainEvent[];
  readonly stateAfter: MatchState;
  readonly at: number;
  readonly actorAccountId: string | null;
  readonly mark: MarkContext | null;
}

export interface MatchStore {
  insert(record: NewMatchRecord): Promise<void>;
  load(matchId: string): Promise<LoadedMatch | null>;
  // Appends in one transaction with the projections; throws when another writer won.
  append(input: AppendInput): Promise<readonly StoredEvent[]>;
  setStatus(
    matchId: string,
    status: MatchStatus,
    extra?: { readonly startsAt?: number },
  ): Promise<void>;
  setDrawControl(matchId: string, drawMode: DrawMode, drawIntervalMs: number): Promise<void>;
  // The host switches the automatic start on or off (D16).
  setStartRule(matchId: string, rule: StartRule): Promise<void>;
}

export type ActionKind =
  | 'start_match'
  | 'start_round'
  | 'draw'
  | 'close_speed_window'
  | 'auto_mark'
  // At the announced start time: start if enough players (D16); also a start held by
  // maintenance, checked again until maintenance is off (D22).
  | 'auto_start';

export interface ScheduledAction {
  readonly matchId: string;
  readonly kind: ActionKind;
  readonly dueAt: number;
  readonly drawIndex?: number;
}

export interface Scheduler {
  schedule(action: ScheduledAction): Promise<void>;
  // Drops the pending actions of a kind (all kinds when omitted), e.g. draws in host mode.
  cancel(matchId: string, kind?: ActionKind): Promise<void>;
}

export interface MatchEventBus {
  publish(matchId: string, events: readonly StoredEvent[]): void;
  // The match record changed outside the event log: status, start time, draw control.
  changed(record: MatchRecord): void;
}

export interface Clock {
  now(): number;
}

// `sbr maintenance on`: null while maintenance is off; the operator's reason, if any (D22).
export type MaintenanceReader = () => { readonly reason: string | null } | null;
