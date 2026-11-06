/**
 * @file   apps/server/src/realtime/seenLive.ts
 * @module server/realtime
 * @brief  Steps a player watched live count as seen, so they bring back no "new" (D54).
 *
 * Responsibility: per asynchronous match, the highest step seq each player with an open socket
 *                 in the match room was sent (./liveSteps tells it after every step). It writes
 *                 them to `match_entries.last_seen_event_seq` in one statement, at most once per
 *                 10 s per match: the first step of a quiet match at once, later ones at the end
 *                 of the 10 s, so the last steps watched are never left out; a match quiet for
 *                 10 s is forgotten. A seq never moves backwards (GREATEST); rows exist only for
 *                 players, so spectators and guests change nothing. `flushAll` writes what is
 *                 pending at once (tests). The away summary keeps naming what was missed while away.
 * Depends on:     ../db/pool (types)
 * Used by:        ./gateway, ./liveSteps
 * Spec:           docs/spec/06-realtime-architecture.md §6; docs/spec/01-game-design.md §13
 */
import type { DbPool } from '../db/pool.js';

// At most one write per match in this time.
export const SEEN_EVERY_MS = 10_000;

const RECORD_SEEN = `
  UPDATE sbr.match_entries e
     SET last_seen_event_seq = GREATEST(e.last_seen_event_seq, s.seq)
    FROM unnest($2::uuid[], $3::bigint[]) AS s(account_id, seq)
   WHERE e.match_id = $1 AND e.account_id = s.account_id`;

interface MatchSeen {
  // Account id → the highest seq sent to it and not yet written.
  readonly pending: Map<string, number>;
  // The 10 s after a write; its end writes what came meanwhile, or forgets the match.
  timer: NodeJS.Timeout | null;
}

export class SeenLive {
  private readonly matches = new Map<string, MatchSeen>();

  constructor(
    private readonly pool: DbPool,
    private readonly warn: (message: string) => void,
  ) {}

  // The accounts whose sockets in the room were sent the step ending at `seq`.
  record(matchId: string, accountIds: readonly string[], seq: number): void {
    if (accountIds.length === 0) return;
    const m = this.matches.get(matchId) ?? { pending: new Map<string, number>(), timer: null };
    this.matches.set(matchId, m);
    for (const id of accountIds) m.pending.set(id, Math.max(m.pending.get(id) ?? 0, seq));
    // The write catches its own failure (logged), so nobody waits for it here.
    if (m.timer === null) void this.flush(matchId, m);
  }

  // Writes what is pending now, without the 10 s wait (tests: the seen seqs at a known moment).
  async flushAll(): Promise<void> {
    const writes = [...this.matches].flatMap(([matchId, m]) => {
      if (m.pending.size === 0) return [];
      if (m.timer !== null) clearTimeout(m.timer);
      return [this.flush(matchId, m)];
    });
    await Promise.all(writes);
  }

  private flush(matchId: string, m: MatchSeen): Promise<void> {
    const ids = [...m.pending.keys()];
    const seqs = ids.map((id) => m.pending.get(id) ?? 0);
    m.pending.clear();
    const written = this.pool
      .query(RECORD_SEEN, [matchId, ids, seqs])
      .then(() => undefined)
      .catch((error: unknown) => {
        this.warn(`recording live steps as seen failed: ${String(error)}`);
      });
    m.timer = setTimeout(() => {
      m.timer = null;
      if (m.pending.size > 0) void this.flush(matchId, m);
      else this.matches.delete(matchId);
    }, SEEN_EVERY_MS);
    // A shutdown does not wait for it (a late write only logs its failure).
    m.timer.unref();
    return written;
  }
}
