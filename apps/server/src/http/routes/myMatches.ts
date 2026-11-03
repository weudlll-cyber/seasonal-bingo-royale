/**
 * @file   apps/server/src/http/routes/myMatches.ts
 * @module server/http
 * @brief  GET /api/v1/me/matches: the signed-in player's matches that are not over (D39).
 *
 * Responsibility: one query over the account's match entries: every match in its lobby or
 *                 running (asynchronous and realtime), newest first, with the start facts, the
 *                 newest round from the event log, the cuts the player came through and the cut
 *                 that put the player out. Only the session's own account; a guest 401.
 * Depends on:     fastify, @sbr/contracts (types), ../../db/pool
 * Used by:        ./matches
 * Spec:           docs/spec/05-api-design.md §2.2; docs/spec/01-game-design.md §13 (D39)
 */
import type { MyMatch, MyMatches } from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';

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
           m.lobby_closes_at, m.created_at, e.player_id
      FROM sbr.match_entries e JOIN sbr.matches m ON m.id = e.match_id
     WHERE e.account_id = $1 AND m.status IN ('lobby', 'running')
  ), cuts AS (
    SELECT v.match_id, v.payload, row_number() OVER (PARTITION BY v.match_id ORDER BY v.seq) AS n
      FROM sbr.match_events v
     WHERE v.match_id IN (SELECT id FROM mine) AND v.type = 'cutApplied'
  )
  SELECT x.code, x.title, x.mode, x.status, x.starts_at, x.start_rule, x.start_at,
         x.lobby_closes_at,
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
    lobbyClosesAt: ms(r.lobby_closes_at),
    roundIndex: r.round_index,
    cutsSurvived: r.cuts_survived,
    outInCut: r.out_in_cut,
  };
}

export async function myMatches(pool: DbPool, accountId: string): Promise<MyMatches> {
  const r = await pool.query<MyMatchRow>(MY_MATCHES, [accountId]);
  return { matches: r.rows.map(myMatch) };
}

export function registerMyMatches(app: FastifyInstance, deps: { readonly pool: DbPool }): void {
  app.get('/api/v1/me/matches', async (request, reply) => {
    const accountId = request.session?.accountId ?? null;
    if (accountId === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
    return reply.header('cache-control', 'no-store').send(await myMatches(deps.pool, accountId));
  });
}
