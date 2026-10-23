/**
 * @file   apps/server/src/view/liveViews.ts
 * @module server/view
 * @brief  One replay per live match, extended with new events, shared by every screen's fetch.
 *
 * Responsibility: keep for each match a `LiveReplay` of all players (renamed events, every
 *                 player's status timeline, stage baselines, first-round cards) and extend
 *                 it with only the events logged since the last request, up to the match's
 *                 current seq. A screen's fetch then picks its viewer's slice instead of
 *                 replaying the whole log (the 200-player check: NIGHT-3 piece 5). Updates
 *                 of one match run one at a time; the match's command queue is not used, so
 *                 fetches never hold up draws and taps. The names are read again, and the
 *                 replay rebuilt, when the player list changed (lobby joins).
 * Depends on:     @sbr/application (types), ../match/codec, ./clientEvents
 * Used by:        ../http/routes/matches, ../http/routes/matchViews
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/02-software-architecture.md §5
 */
import type { LoadedMatch, StoredEvent } from '@sbr/application';

import { publicEvent } from '../match/codec.js';
import { LiveReplay } from './clientEvents.js';

interface LiveViewSources {
  // Logged events with a seq above `afterSeq`.
  readonly events: (matchId: string, afterSeq: number) => Promise<readonly StoredEvent[]>;
  // Player id → display name.
  readonly names: (matchId: string) => Promise<Readonly<Record<string, string>>>;
}

export interface LiveEntry {
  readonly replay: LiveReplay;
  readonly idMap: ReadonlyMap<string, string>;
  readonly players: number;
}

export class LiveViews {
  private readonly entries = new Map<string, LiveEntry>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly sources: LiveViewSources) {}

  // The match's replay, extended to its current seq.
  entryFor(m: LoadedMatch): Promise<LiveEntry> {
    const id = m.record.id;
    const next = (this.queues.get(id) ?? Promise.resolve()).then(() => this.update(m));
    this.queues.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  private async update(m: LoadedMatch): Promise<LiveEntry> {
    const id = m.record.id;
    let entry = this.entries.get(id);
    const players = m.state.playerOrder.length;
    if (entry === undefined || entry.players !== players || entry.replay.length > m.seq) {
      const names = await this.sources.names(id);
      const idMap = new Map(m.state.playerOrder.map((p) => [p, names[p] ?? p]));
      entry = { replay: new LiveReplay(idMap, 'all'), idMap, players };
      this.entries.set(id, entry);
    }
    if (entry.replay.length < m.seq) {
      const fresh = await this.sources.events(id, entry.replay.length);
      entry.replay.extend(fresh.filter((e) => e.seq <= m.seq).map((e) => publicEvent(e.event)));
    }
    return entry;
  }
}
