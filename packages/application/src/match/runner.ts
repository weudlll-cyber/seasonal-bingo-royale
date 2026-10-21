/**
 * @file   packages/application/src/match/runner.ts
 * @module application/match
 * @brief  Runs commands against one match: serialized, persisted, published (02 §5.2, §5.4).
 *
 * Responsibility: one command batch per match at a time (an in-process queue per match);
 *                 the match is loaded from the store once and kept in memory; commands are
 *                 decided one after another on the evolving state, the produced events
 *                 appended in one transaction (the store's version check is the safety
 *                 net: on a conflict the cache is dropped and the error rises) and then
 *                 published on the event bus. Keeps the draw times of the current round.
 * Depends on:     @sbr/domain, ./ports
 * Used by:        ./engine
 * Spec:           docs/spec/02-software-architecture.md §5.2, §5.4
 */
import { decide, evolve, type Command, type DomainEvent } from '@sbr/domain';

import type { Clock, LoadedMatch, MarkContext, MatchEventBus, MatchStore } from './ports.js';

export class MatchNotFound extends Error {
  constructor(matchId: string) {
    super(`match ${matchId} not found`);
  }
}

export interface ApplyOptions {
  readonly actorAccountId?: string | null;
  readonly mark?: MarkContext | null;
}

export class MatchRunner {
  private readonly cache = new Map<string, LoadedMatch>();
  private readonly queues = new Map<string, Promise<unknown>>();

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

  async current(matchId: string): Promise<LoadedMatch> {
    const cached = this.cache.get(matchId);
    if (cached !== undefined) return cached;
    const loaded = await this.store.load(matchId);
    if (loaded === null) throw new MatchNotFound(matchId);
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
    const now = this.clock.now();
    let state = loaded.state;
    const produced: DomainEvent[] = [];
    for (const command of commands) {
      for (const event of decide(state, command, { now })) {
        state = evolve(state, event);
        produced.push(event);
      }
    }
    if (produced.length === 0) return produced;
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
      this.bus.publish(matchId, stored);
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
