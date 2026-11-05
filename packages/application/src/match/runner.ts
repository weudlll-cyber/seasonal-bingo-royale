/**
 * @file   packages/application/src/match/runner.ts
 * @module application/match
 * @brief  Runs commands against one match: serialized, persisted, published (02 §5.2, §5.4).
 *
 * Responsibility: one command batch per match at a time (an in-process queue per match);
 *                 the match is loaded from the store once and kept in memory (callers that miss
 *                 the cache meanwhile share that load; a load that ends late never replaces a
 *                 newer match); commands are
 *                 decided one after another on the evolving state, the produced events
 *                 appended in one transaction (the store's version check is the safety
 *                 net: on a conflict the cache is dropped and the error rises) and then
 *                 published on the event bus. Keeps the draw times of the current round. A
 *                 caller may ask how long deciding, appending and publishing took (`timing`,
 *                 the tap breakdown of 12 §5).
 * Depends on:     @sbr/domain, ./ports
 * Used by:        ./engine, ../index, ./flow
 * Spec:           docs/spec/02-software-architecture.md §5.2, §5.4
 */
import { decide, evolve, type Command, type DomainEvent } from '@sbr/domain';

import type { Clock, LoadedMatch, MarkContext, MatchEventBus, MatchStore } from './ports.js';

export class MatchNotFound extends Error {
  constructor(matchId: string) {
    super(`match ${matchId} not found`);
  }
}

// Filled in by apply, in the clock's milliseconds.
export interface ApplyTiming {
  decideMs: number;
  appendMs: number;
  publishMs: number;
}

interface ApplyOptions {
  readonly actorAccountId?: string | null;
  readonly mark?: MarkContext | null;
  readonly timing?: ApplyTiming;
}

export class MatchRunner {
  private readonly cache = new Map<string, LoadedMatch>();
  private readonly queues = new Map<string, Promise<unknown>>();
  // A load under way per match, shared by the callers that miss the cache meanwhile.
  private readonly loading = new Map<string, Promise<LoadedMatch | null>>();

  constructor(
    private readonly store: MatchStore,
    private readonly bus: MatchEventBus,
    private readonly clock: Clock,
  ) {}

  // Runs `task` after every earlier task of the same match has finished.
  serial<T>(matchId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(matchId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(
      matchId,
      next.catch(() => undefined),
    );
    return next;
  }

  // The cached match, else one load shared by every caller meanwhile. A load that ends after a
  // command was stored never replaces that newer match (a lobby poll during `create` did, and
  // the next join met a version conflict).
  async current(matchId: string): Promise<LoadedMatch> {
    const cached = this.cache.get(matchId);
    if (cached !== undefined) return cached;
    let pending = this.loading.get(matchId);
    if (pending === undefined) {
      pending = this.store.load(matchId).finally(() => this.loading.delete(matchId));
      this.loading.set(matchId, pending);
    }
    const loaded = await pending;
    if (loaded === null) throw new MatchNotFound(matchId);
    const newer = this.cache.get(matchId);
    if (newer !== undefined && newer.seq >= loaded.seq) return newer;
    this.cache.set(matchId, loaded);
    return loaded;
  }

  // Changes the cached record and tells the bus (status, start time, draw control).
  update(matchId: string, change: (m: LoadedMatch) => LoadedMatch): void {
    const cached = this.cache.get(matchId);
    if (cached === undefined) return;
    const next = change(cached);
    this.cache.set(matchId, next);
    this.bus.changed(next.record);
  }

  // Decides the commands in order on the evolving state; persists and publishes the
  // events. Commands the domain ignores (empty result) leave the match untouched.
  async apply(
    matchId: string,
    commands: readonly Command[],
    options: ApplyOptions = {},
  ): Promise<readonly DomainEvent[]> {
    const loaded = await this.current(matchId);
    const now = this.clock.now(matchId);
    const timing = options.timing;
    let state = loaded.state;
    const produced: DomainEvent[] = [];
    for (const command of commands) {
      for (const event of decide(state, command, { now })) {
        state = evolve(state, event);
        produced.push(event);
      }
    }
    if (produced.length === 0) return produced;
    const decided = this.clock.now(matchId);
    if (timing !== undefined) timing.decideMs = decided - now;
    try {
      const stored = await this.store.append({
        matchId,
        expectedSeq: loaded.seq,
        events: produced,
        stateAfter: state,
        at: now,
        actorAccountId: options.actorAccountId ?? null,
        mark: options.mark ?? null,
      });
      const drawTimes = nextDrawTimes(loaded.drawTimes, produced, now);
      this.cache.set(matchId, { ...loaded, state, seq: loaded.seq + produced.length, drawTimes });
      const appended = this.clock.now(matchId);
      this.bus.publish(matchId, stored);
      if (timing !== undefined) {
        timing.appendMs = appended - decided;
        timing.publishMs = this.clock.now(matchId) - appended;
      }
    } catch (error) {
      this.cache.delete(matchId);
      throw error;
    }
    return produced;
  }
}

function nextDrawTimes(
  times: readonly number[],
  events: readonly DomainEvent[],
  now: number,
): readonly number[] {
  let next = times;
  for (const event of events) {
    if (event.type === 'roundStarted') next = [];
    if (event.type === 'drawMade') next = [...next, now];
  }
  return next;
}
