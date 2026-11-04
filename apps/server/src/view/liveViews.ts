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
 *                 the same for every screen, rebuilt from the log after a restart. Names are read
 *                 again after 30 s and at once after a deletion here, so a deleted account soon
 *                 shows as "deleted player …" (audit S10); a changed name rebuilds the replay. One instance
 *                 per server serves the state fetches and the live frames (../realtime/liveSteps);
 *                 the frames pass the events they already hold, so no read of the log is needed.
 * Depends on:     @sbr/application (types), @sbr/contracts (types), ../db/pool, ../match/codec,
 *                 ./clientEvents, ./playerNames, ./roundRecap
 * Used by:        ../http/app, ../http/routes/matches, ../http/routes/matchViews,
 *                 ../realtime/liveSteps
 * Spec:           docs/spec/06-realtime-architecture.md §4, §8; docs/spec/02-software-architecture.md §5
 */
import type { LoadedMatch, StoredEvent } from '@sbr/application';
import type { RoundRecap } from '@sbr/contracts';

import type { DbPool } from '../db/pool.js';
import { publicEvent } from '../match/codec.js';
import { LiveReplay } from './clientEvents.js';
import { playerNames } from './playerNames.js';
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
  // When the names were read: older than NAMES_TTL_MS, they are read again (audit S10).
  namesAt: number;
  // The same public events with the time each was stored, for the round recap.
  readonly timed: TimedEvent[];
  // The recap of the pause now running, with the round and event count it was built at.
  recap: { readonly key: string; readonly recap: RoundRecap | null } | null;
}

// A deleted account shows as "deleted player …" (audit S10): names are read again after this
// long, and at once for a deletion in this server (accountGone); a change rebuilds the replay.
const NAMES_TTL_MS = 30_000;

export class LiveViews {
  private readonly entries = new Map<string, LiveEntry>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly sources: LiveViewSources) {}

  // The match's replay, extended to its current seq; `held`: events the caller has already
  // (the bus's), used instead of reading the log when they cover what is missing.
  entryFor(m: LoadedMatch, held: readonly StoredEvent[] = []): Promise<LiveEntry> {
    const id = m.record.id;
    const next = (this.queues.get(id) ?? Promise.resolve()).then(() => this.update(m, held));
    this.queues.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  private async update(m: LoadedMatch, held: readonly StoredEvent[]): Promise<LiveEntry> {
    const id = m.record.id;
    let entry = this.entries.get(id);
    const players = m.state.playerOrder.length;
    if (entry !== undefined && Date.now() - entry.namesAt >= NAMES_TTL_MS) {
      const names = await this.sources.names(id);
      const same = [...entry.idMap].every(([p, name]) => (names[p] ?? p) === name);
      if (same) entry.namesAt = Date.now();
      else entry = undefined;
    }
    if (entry === undefined || entry.players !== players || entry.replay.length > m.seq) {
      const names = await this.sources.names(id);
      const idMap = new Map(m.state.playerOrder.map((p) => [p, names[p] ?? p]));
      const namesAt = Date.now();
      entry = {
        replay: new LiveReplay(idMap, 'all'),
        idMap,
        players,
        namesAt,
        timed: [],
        recap: null,
      };
      this.entries.set(id, entry);
    }
    if (entry.replay.length < m.seq) {
      const after = entry.replay.length;
      const covered = held.find((e) => e.seq === after + 1) !== undefined;
      const fresh = (
        covered ? held.filter((e) => e.seq > after) : await this.sources.events(id, after)
      ).filter((e) => e.seq <= m.seq);
      const events = fresh.map((e) => publicEvent(e.event));
      entry.replay.extend(events);
      entry.timed.push(...events.map((event, i) => ({ event, at: fresh[i]?.occurredAt ?? 0 })));
    }
    return entry;
  }

  // An account deleted in this server: the replays naming it are built again with fresh names.
  accountGone(accountId: string): void {
    for (const [id, entry] of this.entries) if (entry.idMap.has(accountId)) this.entries.delete(id);
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

// The marks of a round the players tapped themselves (the round recap's fastest tapper).
async function manualTaps(pool: DbPool, matchId: string, roundIndex: number): Promise<string[]> {
  const r = await pool.query<{ key: string }>(
    `SELECT player_id || ':' || card_index || ':' || cell AS key FROM sbr.marks
      WHERE match_id = $1 AND round_index = $2 AND source = 'manual'`,
    [matchId, roundIndex],
  );
  return r.rows.map((row) => row.key);
}

// The server's one LiveViews: the log from the match store, names and taps from the database.
export function liveViewsOn(pool: DbPool, store: { events: LiveViewSources['events'] }): LiveViews {
  return new LiveViews({
    events: (id, afterSeq) => store.events(id, afterSeq),
    names: (id) => playerNames(pool, id),
    manualTaps: (id, round) => manualTaps(pool, id, round),
  });
}
