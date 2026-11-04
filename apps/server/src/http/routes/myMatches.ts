/**
 * @file   apps/server/src/http/routes/myMatches.ts
 * @module server/http
 * @brief  The signed-in player's matches that are not over, for GET /api/v1/matches (D39).
 *
 * Responsibility: one query over the account's match entries: every match in its lobby or
 *                 running (asynchronous and realtime), newest first, with the start facts, the
 *                 newest round from the event log, the cuts the player came through and the cut
 *                 that put the player out, whether every place is taken; status, countdown and
 *                 "full" taken from the lobby list of the same answer. Only the session's own account.
 * Depends on:     @sbr/contracts (types), ../../db/pool
 * Used by:        ./matches
 * Spec:           docs/spec/05-api-design.md §2.2; docs/spec/01-game-design.md §13 (D39)
 */
import type { MyMatch } from '@sbr/contracts';

import type { DbPool } from '../../db/pool.js';

interface MyMatchRow {
  code: string;
  title: string;
  mode: MyMatch['mode'];
  status: MyMatch['status'];
  starts_at: Date | null;
  start_rule: 'host' | 'at' | 'whenFull';
  start_at: Date | null;
  lobby_closes_at: Date | null;
  full: boolean;
  round_index: number | null;
  cuts_survived: number;
  out_in_cut: number | null;
}

// The player's open matches first, then the cut events of those matches only (stored as the
// domain's events: survivors and eliminated hold the player ids; a player's id is the account
// id). The cut that put the player out is the number of cuts up to the one naming them among
// the eliminated. The round and cuts come from the match's events by (match_id, seq).
const MY_MATCHES = `
  WITH mine AS (
    SELECT m.id, m.code, m.title, m.mode, m.status, m.starts_at, m.start_rule, m.start_at,
           m.lobby_closes_at, m.max_players, m.created_at, e.player_id
      FROM sbr.match_entries e JOIN sbr.matches m ON m.id = e.match_id
     WHERE e.account_id = $1 AND m.status IN ('lobby', 'running')
  ), cuts AS (
    SELECT v.match_id, v.payload, row_number() OVER (PARTITION BY v.match_id ORDER BY v.seq) AS n
      FROM sbr.match_events v
     WHERE v.match_id IN (SELECT id FROM mine) AND v.type = 'cutApplied'
  )
  SELECT x.code, x.title, x.mode, x.status, x.starts_at, x.start_rule, x.start_at,
         x.lobby_closes_at,
         (SELECT count(*) FROM sbr.match_entries f WHERE f.match_id = x.id) >= x.max_players AS full,
         (SELECT max((v.payload->>'roundIndex')::int) FROM sbr.match_events v
           WHERE v.match_id = x.id AND v.type = 'roundStarted') AS round_index,
         (SELECT count(*) FROM cuts c
           WHERE c.match_id = x.id AND c.payload->'survivors' ? x.player_id)::int AS cuts_survived,
         (SELECT min(c.n) FROM cuts c
           WHERE c.match_id = x.id AND c.payload->'eliminated' ? x.player_id)::int AS out_in_cut
    FROM mine x
   ORDER BY x.created_at DESC`;

const ms = (d: Date | null): number | null => (d === null ? null : d.getTime());

function myMatch(r: MyMatchRow): MyMatch {
  return {
    code: r.code,
    title: r.title,
    mode: r.mode,
    status: r.status,
    startsAt: ms(r.starts_at),
    startAt: r.start_rule === 'at' ? ms(r.start_at) : null,
    startsWhenFull: r.start_rule === 'whenFull',
    full: r.full,
    lobbyClosesAt: ms(r.lobby_closes_at),
    roundIndex: r.round_index,
    cutsSurvived: r.cuts_survived,
    outInCut: r.out_in_cut,
  };
}

// The lobby list's own summaries win for where a match stands (status, countdown, full), so
// the lobby card and "My matches" in one answer always agree; one the list has as over is left out.
type Listed = Pick<MyMatch, 'code' | 'startsAt' | 'full'> & { readonly status: string };

export async function myMatches(
  pool: DbPool,
  accountId: string,
  listed: readonly Listed[],
): Promise<readonly MyMatch[]> {
  const r = await pool.query<MyMatchRow>(MY_MATCHES, [accountId]);
  const byCode = new Map(listed.map((m) => [m.code, m]));
  return r.rows.map(myMatch).flatMap((m) => {
    const card = byCode.get(m.code);
    if (card === undefined) return [m];
    if (card.status !== 'lobby' && card.status !== 'running') return [];
    return [{ ...m, status: card.status, startsAt: card.startsAt, full: card.full }];
  });
}
