/**
 * @file   apps/server/src/view/playerNames.ts
 * @module server/view
 * @brief  Display names of a match's players, for the shared replay of the live views.
 *
 * Responsibility: playerNames reads names from the match's own entries: an account's display
 *                 name, a bot's id, for a deleted account "deleted player" with a short tag that
 *                 keeps names apart, never the account id (audit S10). The replay reads them when
 *                 its player list changes (./liveViews); state answers and live frames both use it.
 * Depends on:     ../db/pool
 * Used by:        ./liveViews
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
