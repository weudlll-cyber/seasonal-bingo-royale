/**
 * @file   apps/server/src/view/eventLog.ts
 * @module server/view
 * @brief  A match's decoded event log, shared by the away summaries and extended by its tail.
 *
 * Responsibility: per match the logged events read so far; a request up to a seq reads only the
 *                 events after what is held, requests for one match run one at a time, so many
 *                 players asking at once (200 after a day of an asynchronous match) share one
 *                 read and decode (the load check of 2026-11-04: each decoded the whole log,
 *                 64 s p95). Holds the 16 matches asked for last, and the replayed state after a
 *                 seq (the 32 asked for last), shared by players who last looked at that seq.
 * Depends on:     @sbr/application (types), @sbr/domain
 * Used by:        ../http/routes/awaySummary
 * Spec:           docs/spec/06-realtime-architecture.md §6; docs/spec/12-testing-strategy.md §5
 */
import type { StoredEvent } from '@sbr/application';
import { createInitialMatchState, evolve, type MatchState } from '@sbr/domain';

const MATCHES_HELD = 16;
const STATES_HELD = 32;

type ReadAfter = (matchId: string, afterSeq: number) => Promise<readonly StoredEvent[]>;

export class EventLogCache {
  private readonly held = new Map<string, readonly StoredEvent[]>();
  private readonly queues = new Map<string, Promise<unknown>>();
  // The state after a seq, by "match:seq": players who last looked at the same seq share it.
  private readonly states = new Map<string, Promise<MatchState>>();

  constructor(private readonly readAfter: ReadAfter) {}

  // The match's events with a seq up to `seq`, in order.
  upTo(matchId: string, seq: number): Promise<readonly StoredEvent[]> {
    const next = (this.queues.get(matchId) ?? Promise.resolve()).then(() =>
      this.extend(matchId, seq),
    );
    this.queues.set(
      matchId,
      next.catch(() => undefined),
    );
    return next;
  }

  // The match state after the event `seq`, replayed once per match and seq.
  stateAt(matchId: string, seq: number): Promise<MatchState> {
    const key = `${matchId}:${String(seq)}`;
    const held = this.states.get(key);
    if (held !== undefined) return held;
    const state = this.upTo(matchId, seq).then((events) =>
      events.reduce((s, e) => evolve(s, e.event), createInitialMatchState()),
    );
    this.states.set(key, state);
    // A failed read is not kept: the next request tries again.
    state.catch(() => this.states.delete(key));
    if (this.states.size > STATES_HELD) this.states.delete(this.states.keys().next().value ?? '');
    return state;
  }

  private async extend(matchId: string, seq: number): Promise<readonly StoredEvent[]> {
    let events = this.held.get(matchId) ?? [];
    const last = events.at(-1)?.seq ?? 0;
    if (last < seq) events = [...events, ...(await this.readAfter(matchId, last))];
    // The newest asked for last; the oldest goes when more than MATCHES_HELD are held.
    this.held.delete(matchId);
    this.held.set(matchId, events);
    if (this.held.size > MATCHES_HELD) this.held.delete(this.held.keys().next().value ?? '');
    if (events.length === 0 || events.at(-1)?.seq === seq) return events;
    return events.filter((e) => e.seq <= seq);
  }
}
