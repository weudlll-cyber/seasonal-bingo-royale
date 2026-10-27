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
 *                 replay rebuilt, when the player list changed (lobby joins). During the pause
 *                 after a royale round the round's recap (./roundRecap, D20) is built from the
 *                 same events with their stored times and the stored own taps, once per round
 *                 and event count, so every screen gets the same recap and a restarted server
 *                 rebuilds it from the log.
 * Depends on:     @sbr/application (types), @sbr/contracts (types), ../match/codec,
 *                 ./clientEvents, ./roundRecap
 * Used by:        ../http/routes/matches, ../http/routes/matchViews
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/02-software-architecture.md §5
 */
import type { LoadedMatch, StoredEvent } from '@sbr/application';
import type { RoundRecap } from '@sbr/contracts';

import { publicEvent } from '../match/codec.js';
import { LiveReplay } from './clientEvents.js';
import { buildRoundRecap, type TimedEvent } from './roundRecap.js';

interface LiveViewSources {
  // Logged events with a seq above `afterSeq`.
  readonly events: (matchId: string, afterSeq: number) => Promise<readonly StoredEvent[]>;
  // Player id → display name.
  readonly names: (matchId: string) => Promise<Readonly<Record<string, string>>>;
  // The marks of a round stored as the player's own taps, as `${playerId}:${card}:${cell}`.
  readonly manualTaps: (matchId: string, roundIndex: number) => Promise<readonly string[]>;
}

export interface LiveEntry {
  readonly replay: LiveReplay;
  readonly idMap: ReadonlyMap<string, string>;
  readonly players: number;
  // The same public events with the time each was stored, for the round recap.
  readonly timed: TimedEvent[];
  // The recap of the pause now running, with the round and event count it was built at.
  recap: { readonly key: string; readonly recap: RoundRecap | null } | null;
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
      entry = { replay: new LiveReplay(idMap, 'all'), idMap, players, timed: [], recap: null };
      this.entries.set(id, entry);
    }
    if (entry.replay.length < m.seq) {
      const fresh = (await this.sources.events(id, entry.replay.length)).filter(
        (e) => e.seq <= m.seq,
      );
      const events = fresh.map((e) => publicEvent(e.event));
      entry.replay.extend(events);
      entry.timed.push(...events.map((event, i) => ({ event, at: fresh[i]?.occurredAt ?? 0 })));
    }
    return entry;
  }

  // The recap of the royale round just played, while the match pauses before the next one
  // (D20); null outside such a pause. Built once per round and event count.
  async recapFor(m: LoadedMatch, entry: LiveEntry): Promise<RoundRecap | null> {
    const round = m.state.currentRound;
    const paused =
      m.record.gameType === 'royale' && m.state.phase === 'running' && round?.ended === true;
    if (!paused) return null;
    const key = `${String(round.roundIndex)}:${String(entry.replay.length)}`;
    if (entry.recap?.key !== key) {
      const taps = await this.sources.manualTaps(m.record.id, round.roundIndex);
      const recap = buildRoundRecap({
        events: entry.timed,
        roundIndex: round.roundIndex,
        idMap: entry.idMap,
        speedWindowMs: m.record.ruleset.marking.speedWindowMs,
        manualTaps: new Set(taps),
      });
      entry.recap = { key, recap };
    }
    return entry.recap.recap;
  }
}
