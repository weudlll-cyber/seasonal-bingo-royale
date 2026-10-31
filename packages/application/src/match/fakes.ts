/**
 * @file   packages/application/src/match/fakes.ts
 * @module application/match
 * @brief  In-memory store, scheduler, bus and a manual clock for engine tests.
 *
 * Responsibility: the engine's ports without a database: the store folds its events with
 *                 the domain's evolve and checks the expected seq; the scheduler keeps due
 *                 actions and `runDue` executes them in due order while advancing the clock,
 *                 as PgScheduler does; `fakeEngine` wires an engine to them, with a
 *                 maintenance switch (`maintenance.on`, D22). Test support only.
 * Depends on:     @sbr/domain, ./ports, ./engine
 * Used by:        the engine tests (test helper)
 * Spec:           docs/spec/12-testing-strategy.md §2
 */
import { createInitialMatchState, evolve, type DomainEvent } from '@sbr/domain';

import { MatchEngine } from './engine.js';
import type {
  ActionKind,
  AppendInput,
  LoadedMatch,
  MatchRecord,
  MatchStore,
  NewMatchRecord,
  ScheduledAction,
  Scheduler,
  StartRule,
  StoredEvent,
} from './ports.js';

class ManualClock {
  constructor(public t = 1_000_000) {}
  now(): number {
    return this.t;
  }
}

class MemoryStore implements MatchStore {
  readonly records = new Map<string, MatchRecord>();
  readonly events = new Map<string, StoredEvent[]>();

  insert(r: NewMatchRecord): Promise<void> {
    this.records.set(r.id, { ...r, status: 'lobby', startsAt: null });
    this.events.set(r.id, []);
    return Promise.resolve();
  }

  load(matchId: string): Promise<LoadedMatch | null> {
    const record = this.records.get(matchId);
    const log = this.events.get(matchId) ?? [];
    if (record === undefined) return Promise.resolve(null);
    const state = log.reduce((s, e) => evolve(s, e.event), createInitialMatchState());
    const lastRound = log.map((e) => e.event.type).lastIndexOf('roundStarted');
    const drawTimes = log
      .slice(lastRound + 1)
      .filter((e) => e.event.type === 'drawMade')
      .map((e) => e.occurredAt);
    return Promise.resolve({ record, state, seq: log.length, drawTimes });
  }

  append(input: AppendInput): Promise<readonly StoredEvent[]> {
    const log = this.events.get(input.matchId) ?? [];
    if (log.length !== input.expectedSeq) return Promise.reject(new Error('version conflict'));
    const stored = input.events.map((event, i) => ({
      seq: log.length + i + 1,
      event,
      occurredAt: input.at,
    }));
    log.push(...stored);
    return Promise.resolve(stored);
  }

  setStatus(
    matchId: string,
    status: MatchRecord['status'],
    extra: { startsAt?: number } = {},
  ): Promise<void> {
    const r = this.records.get(matchId);
    if (r !== undefined)
      this.records.set(matchId, { ...r, status, startsAt: extra.startsAt ?? r.startsAt });
    return Promise.resolve();
  }

  setDrawControl(
    matchId: string,
    drawMode: 'auto' | 'host',
    drawIntervalMs: number,
  ): Promise<void> {
    const r = this.records.get(matchId);
    if (r !== undefined)
      this.records.set(matchId, { ...r, settings: { ...r.settings, drawMode, drawIntervalMs } });
    return Promise.resolve();
  }

  setStartRule(matchId: string, startRule: StartRule): Promise<void> {
    const r = this.records.get(matchId);
    if (r !== undefined)
      this.records.set(matchId, { ...r, settings: { ...r.settings, startRule } });
    return Promise.resolve();
  }

  types(matchId: string): readonly DomainEvent['type'][] {
    return (this.events.get(matchId) ?? []).map((e) => e.event.type);
  }
}

class MemoryScheduler implements Scheduler {
  pending: ScheduledAction[] = [];

  schedule(action: ScheduledAction): Promise<void> {
    this.pending.push(action);
    return Promise.resolve();
  }

  cancel(matchId: string, kind?: ActionKind): Promise<void> {
    this.pending = this.pending.filter(
      (a) => a.matchId !== matchId || (kind !== undefined && a.kind !== kind),
    );
    return Promise.resolve();
  }

  // Runs due actions in due order (scheduling order on ties), moving the clock to each,
  // and leaves the clock at `until` when that is a finite time.
  async runUntil(
    engine: MatchEngine,
    clock: ManualClock,
    until: number,
    maxActions = 5_000,
  ): Promise<void> {
    for (let n = 0; n < maxActions; n += 1) {
      const next = [...this.pending].sort((a, b) => a.dueAt - b.dueAt)[0];
      if (next === undefined || next.dueAt > until) {
        if (Number.isFinite(until)) clock.t = Math.max(clock.t, until);
        return;
      }
      this.pending.splice(this.pending.indexOf(next), 1);
      clock.t = Math.max(clock.t, next.dueAt);
      await engine.handle(next);
    }
  }
}

// An engine on the in-memory ports, with every event the bus publishes and its time.
export function fakeEngine() {
  const maintenance = { on: false, reason: null as string | null };
  const store = new MemoryStore();
  const scheduler = new MemoryScheduler();
  const clock = new ManualClock();
  const published: { at: number; event: StoredEvent['event'] }[] = [];
  let n = 0;
  const engine = new MatchEngine({
    store,
    scheduler,
    bus: {
      publish: (_id, stored) => {
        for (const s of stored) published.push({ at: clock.t, event: s.event });
      },
      changed: () => undefined,
    },
    clock,
    maintenance: () => (maintenance.on ? { reason: maintenance.reason } : null),
    randomSeed: () => new Uint8Array(32).fill(7),
    randomCode: () => `CODE${String((n += 1))}`,
  });
  return { store, scheduler, clock, engine, published, maintenance };
}
