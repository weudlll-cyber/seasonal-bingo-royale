/**
 * @file   apps/server/src/http/routes/matches.ts
 * @module server/http
 * @brief  Match routes under /api/v1: list, create, detail, state, join, start, host controls.
 *
 * Responsibility: GET /matches (open, running and recent matches), POST /matches
 *                 (match.create), GET /matches/:code, GET /matches/:code/state?since= (the live view the client folds, ./matchViews),
 *                 POST /matches/:code/join (match.join), and for the match's creator with
 *                 match.manage: /start (countdown), /draw-next, PUT /draw-mode, /abort;
 *                 POST /matches/:code/marks is the fallback for clients without a socket.
 *                 Development builds also have POST /matches/:code/bots. Errors of the
 *                 engine become 4xx with their code.
 * Depends on:     fastify, zod, @sbr/application, ../../match/*, ../../db/pool
 * Used by:        ../app
 * Spec:           docs/spec/05-api-design.md §2.3, §3; docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §5, §6
 */
import type { MatchEngine } from '@sbr/application';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import type { PgMatchStore } from '../../match/pgMatchStore.js';
import { registerHostRoutes } from './matchHost.js';
import { createBody, sendEngineError, toCreateInput } from './matchInput.js';
import { liveView, matchSummary } from './matchViews.js';

export interface MatchRouteDeps {
  readonly pool: DbPool;
  readonly engine: MatchEngine;
  readonly store: PgMatchStore;
  readonly dev: boolean;
}

export function requirePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: string,
): string | null {
  const s = request.session;
  if (s?.accountId == null) {
    void reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
    return null;
  }
  if (!s.permissions.includes(permission)) {
    void reply.status(403).send({ code: 'FORBIDDEN' });
    return null;
  }
  return s.accountId;
}

export async function matchIdByCode(pool: DbPool, code: string): Promise<string | null> {
  const r = await pool.query<{ id: string }>('SELECT id FROM sbr.matches WHERE code = $1', [code]);
  return r.rows[0]?.id ?? null;
}

// Display name of every player (bots keep their id).
export async function playerNames(pool: DbPool, matchId: string): Promise<Record<string, string>> {
  const r = await pool.query<{ player_id: string; name: string }>(
    `SELECT e.player_id, COALESCE(a.display_name, e.player_id) AS name
       FROM sbr.match_entries e LEFT JOIN sbr.accounts a ON a.id = e.account_id
      WHERE e.match_id = $1`,
    [matchId],
  );
  return Object.fromEntries(r.rows.map((row) => [row.player_id, row.name]));
}

// Open and running matches, and those finished in the last day, newest first.
function registerMatchList(app: FastifyInstance, deps: MatchRouteDeps): void {
  app.get('/api/v1/matches', async (request) => {
    const rows = await deps.pool.query<{ id: string }>(
      `SELECT id FROM sbr.matches WHERE status IN ('lobby', 'running')
          OR (status IN ('finished', 'aborted') AND finished_at > now() - interval '1 day')
       ORDER BY created_at DESC LIMIT 50`,
    );
    const matches = await Promise.all(rows.rows.map((r) => deps.engine.runner.current(r.id)));
    const viewer = request.session?.accountId ?? null;
    return { matches: matches.map((m) => matchSummary(m, viewer)) };
  });
}

export function registerMatchRoutes(app: FastifyInstance, deps: MatchRouteDeps): void {
  registerMatchList(app, deps);
  app.post('/api/v1/matches', async (request, reply) => {
    const accountId = requirePermission(request, reply, 'match.create');
    if (accountId === null) return reply;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    // The fast test profile exists in development builds only.
    if (parsed.data.testProfile !== undefined && !deps.dev) {
      return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    }
    try {
      const record = await deps.engine.create(toCreateInput(parsed.data), accountId);
      return await reply.status(201).send({ code: record.code, id: record.id });
    } catch (error) {
      return sendEngineError(reply, error);
    }
  });
  app.get<{ Params: { code: string } }>('/api/v1/matches/:code', async (request, reply) => {
    const id = await matchIdByCode(deps.pool, request.params.code);
    if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
    return matchSummary(await deps.engine.runner.current(id), request.session?.accountId ?? null);
  });
  app.get<{ Params: { code: string }; Querystring: { since?: string } }>(
    '/api/v1/matches/:code/state',
    async (request, reply) => {
      const id = await matchIdByCode(deps.pool, request.params.code);
      if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
      // Serialized with the match's commands, so the log and the state belong together.
      return deps.engine.runner.serial(id, async () => {
        const m = await deps.engine.runner.current(id);
        const since = Math.max(0, Math.min(m.seq, Number(request.query.since ?? 0) || 0));
        return liveView({
          match: m,
          events: await deps.store.events(id, 0),
          names: await playerNames(deps.pool, id),
          me: request.session?.accountId ?? null,
          since,
        });
      });
    },
  );
  app.post<{ Params: { code: string } }>('/api/v1/matches/:code/join', async (request, reply) => {
    const accountId = requirePermission(request, reply, 'match.join');
    if (accountId === null) return reply;
    const id = await matchIdByCode(deps.pool, request.params.code);
    if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
    try {
      await deps.engine.join(id, accountId, true);
      return await reply.status(204).send();
    } catch (error) {
      return sendEngineError(reply, error);
    }
  });
  registerHostRoutes(app, deps);
}
