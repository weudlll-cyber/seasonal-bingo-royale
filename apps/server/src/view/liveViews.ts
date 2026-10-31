/**
 * @file   apps/server/src/view/liveViews.ts
 * @module server/view
 * @brief  One replay per live match, extended with new events, shared by every screen's fetch.
 *
 * Responsibility: keep per match a `LiveReplay` of all players (renamed events, status timelines,
 *                 stage baselines, first-round cards), extended only by events since the last
 *                 request; a fetch picks its viewer's slice instead of replaying the log (NIGHT-3
 *                 piece 5). Updates per match run one at a time outside the command queue, never
 *                 delaying draws or taps. A changed player list (lobby joins) rereads names and
 *                 rebuilds the replay. In a royale round pause the recap (./roundRecap, D20) is
 *                 built from the stored event times and own taps, once per round and event count:
 *                 the same for every screen, rebuilt from the log after a restart.
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
