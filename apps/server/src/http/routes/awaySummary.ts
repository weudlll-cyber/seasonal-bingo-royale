/**
 * @file   apps/server/src/http/routes/awaySummary.ts
 * @module server/http
 * @brief  GET /matches/:code/away-summary: "While you were away" for the signed-in player (05 §2.3).
 *
 * Responsibility: for a player of the match, the summary of the events after the player's
 *                 `match_entries.last_seen_event_seq` up to the match's current seq, built by
 *                 the application from the event log (shared per match, ../../view/eventLog;
 *                 asynchronous matches only; a realtime
 *                 match answers null), then acknowledged: the seq is moved up to the current
 *                 one (never down), so the next fetch starts there. Anyone else gets null; a
 *                 guest 401.
 * Depends on:     fastify, @sbr/application, ../../db/pool, ../../view/eventLog, ./matches
 * Used by:        ./matches
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/06-realtime-architecture.md §6;
 *                 docs/spec/01-game-design.md §11
 */
import { summaryBetween } from '@sbr/application';
import type { FastifyInstance } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import { EventLogCache } from '../../view/eventLog.js';
import { matchIdByCode, type MatchRouteDeps } from './matches.js';

// The player's last seen seq; null when the account is not a player of the match.
async function lastSeen(pool: DbPool, matchId: string, accountId: string): Promise<number | null> {
  const r = await pool.query<{ seq: string }>(
    `SELECT last_seen_event_seq AS seq FROM sbr.match_entries
      WHERE match_id = $1 AND account_id = $2`,
    [matchId, accountId],
  );
  const row = r.rows[0];
  return row === undefined ? null : Number(row.seq);
}

async function acknowledge(
  pool: DbPool,
  matchId: string,
  accountId: string,
  seq: number,
): Promise<void> {
  await pool.query(
    `UPDATE sbr.match_entries SET last_seen_event_seq = GREATEST(last_seen_event_seq, $3)
      WHERE match_id = $1 AND account_id = $2`,
    [matchId, accountId, seq],
  );
}

export function registerAwaySummary(app: FastifyInstance, deps: MatchRouteDeps): void {
  // One decoded log per match, extended by its tail: 200 players asking at once share it.
  const log = new EventLogCache((id, after) => deps.store.events(id, after));
  app.get<{ Params: { code: string } }>(
    '/api/v1/matches/:code/away-summary',
    async (request, reply) => {
      const accountId = request.session?.accountId ?? null;
      if (accountId === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
      const id = await matchIdByCode(deps.pool, request.params.code);
      if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
      const m = await deps.engine.runner.current(id);
      const seen = await lastSeen(deps.pool, id, accountId);
      if (seen === null) return { summary: null };
      // The log up to the seq of the state the screens fold (later events wait for the next look).
      const events =
        m.record.ruleset.mode === 'async' && seen < m.seq ? await log.upTo(id, m.seq) : [];
      // The state before is replayed once per seq; the state now is the runner's.
      const summary =
        events.length === 0
          ? null
          : summaryBetween({
              before: await log.stateAt(id, seen),
              after: m.state,
              tail: events.filter((e) => e.seq > seen),
              lastSeenSeq: seen,
              playerId: accountId,
            });
      await acknowledge(deps.pool, id, accountId, m.seq);
      return { summary };
    },
  );
}
