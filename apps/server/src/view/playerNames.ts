/**
 * @file   apps/server/src/view/playerNames.ts
 * @module server/view
 * @brief  Display names of a match's players, for the state view and the gateway's frames.
 *
 * Responsibility: playerNames reads the names from the match's own entries (only players
 *                 of that match are named): an account's display name, a bot's id, and for
 *                 a deleted account "deleted player" with a short tag that keeps names apart,
 *                 never the account id (audit S10). PlayerNameCache keeps those names per
 *                 match for the gateway, which renames every frame: a batch whose ids are
 *                 all known is served from memory; an unknown id (a player who just joined)
 *                 or an entry older than its lifetime (30 s) loads the match again, so a
 *                 deleted account's new name shows; at most 1000 matches are kept, the
 *                 oldest leaves first.
 * Depends on:     ../db/pool
 * Used by:        ../http/routes/matches (state view), ../realtime/gateway, ./playerNames.test
 * Spec:           docs/spec/06-realtime-architecture.md §4; docs/spec/05-api-design.md §2.3
 */
import type { DbPool } from '../db/pool.js';

// Display name of every player of one match, keyed by player id.
export async function playerNames(pool: DbPool, matchId: string): Promise<Record<string, string>> {
  const r = await pool.query<{ player_id: string; name: string }>(
    `SELECT e.player_id,
            CASE WHEN a.display_name IS NOT NULL THEN a.display_name
                 WHEN e.is_bot THEN e.player_id
                 ELSE 'deleted player ' || substr(md5(e.player_id), 1, 4) END AS name
       FROM sbr.match_entries e LEFT JOIN sbr.accounts a ON a.id = e.account_id
      WHERE e.match_id = $1`,
    [matchId],
  );
  return Object.fromEntries(r.rows.map((row) => [row.player_id, row.name]));
}

export interface NameCacheOptions {
  readonly ttlMs: number;
  readonly maxMatches: number;
  readonly now: () => number;
}

const DEFAULTS: NameCacheOptions = { ttlMs: 30_000, maxMatches: 1_000, now: Date.now };

interface Entry {
  readonly names: ReadonlyMap<string, string>;
  readonly loadedAt: number;
}

export class PlayerNameCache {
  private readonly entries = new Map<string, Entry>();
  private readonly options: NameCacheOptions;

  constructor(
    private readonly load: (matchId: string) => Promise<Record<string, string>>,
    options: Partial<NameCacheOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  get size(): number {
    return this.entries.size;
  }

  // The names of the match's players; `ids` are the ids the caller is about to rename.
  async namesFor(matchId: string, ids: Iterable<string>): Promise<ReadonlyMap<string, string>> {
    const cached = this.entries.get(matchId);
    const fresh = cached !== undefined && this.options.now() - cached.loadedAt < this.options.ttlMs;
    if (fresh && [...ids].every((id) => cached.names.has(id))) return cached.names;
    const names = new Map(Object.entries(await this.load(matchId)));
    // Re-inserted at the end: the Map's order is the order of loading, oldest first.
    this.entries.delete(matchId);
    this.entries.set(matchId, { names, loadedAt: this.options.now() });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.options.maxMatches) break;
      this.entries.delete(oldest);
    }
    return names;
  }
}
