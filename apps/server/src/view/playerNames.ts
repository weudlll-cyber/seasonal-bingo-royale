/**
 * @file   apps/server/src/view/playerNames.ts
 * @module server/view
 * @brief  Display names and Discord steps of a match's players, for the shared replay of the live views.
 *
 * Responsibility: playerNames reads names from the match's own entries: an account's display
 *                 name, a bot's id, for a deleted account "deleted player" with a short tag that
 *                 keeps names apart, never the account id (audit S10). The replay reads them when
 *                 its player list changes (./liveViews); state answers and live frames both use it.
 *                 playerSteps reads the steps the website sent at each player's last sign-in.
 * Depends on:     @sbr/contracts (types), ../db/pool
 * Used by:        ./liveViews
 * Spec:           docs/spec/06-realtime-architecture.md §4; docs/spec/05-api-design.md §2.3
 */
import type { Step } from '@sbr/contracts';

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

// The Discord steps of the match's players who have any (website mode, 2026-11-04), keyed by
// player id; bots, deleted accounts and players without steps are left out.
export async function playerSteps(
  pool: DbPool,
  matchId: string,
): Promise<Record<string, readonly Step[]>> {
  const r = await pool.query<{ player_id: string; steps: Step[] }>(
    `SELECT e.player_id, a.steps FROM sbr.match_entries e JOIN sbr.accounts a ON a.id = e.account_id
      WHERE e.match_id = $1 AND a.status = 'active' AND jsonb_array_length(a.steps) > 0`,
    [matchId],
  );
  return Object.fromEntries(r.rows.map((row) => [row.player_id, row.steps]));
}
