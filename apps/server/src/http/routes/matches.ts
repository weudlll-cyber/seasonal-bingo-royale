/**
 * @file   apps/server/src/http/routes/matches.ts
 * @module server/http
 * @brief  Match routes under /api/v1: list, create, detail, state, join, start, host controls.
 *
 * Responsibility: GET /matches (open, running and recent matches), POST /matches
 *                 (match.create; 503 MAINTENANCE while `sbr maintenance on`), GET /matches/:code, GET /matches/:code/state?since= (the live view the client folds, ./matchViews;
 *                 during the pause after a royale round it carries the round's recap, D20),
 *                 POST /matches/:code/join (match.join), and for the match's creator with
 *                 match.manage: /start (countdown), /draw-next, PUT /draw-mode, /abort;
 *                 POST /matches/:code/marks is the fallback for clients without a socket.
 *                 Development builds also have POST /matches/:code/bots. Errors of the
 *                 engine become 4xx with their code.
 * Depends on:     fastify, zod, @sbr/application, ../../match/*, ../../db/pool,
 *                 ../../config/maintenance, ./matchHost, ./matchInput, ./matchViews,
 *                 ../../view/liveViews, ../../view/playerNames
 * Used by:        ../app, ./matchHost
 * Spec:           docs/spec/05-api-design.md §2.3, §3; docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §5, §6
 */
import type { MaintenanceCheck } from '../../config/maintenance.js';
import type { MatchEngine } from '@sbr/application';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import type { PgMatchStore } from '../../match/pgMatchStore.js';
import { registerHostRoutes } from './matchHost.js';
import { LiveViews } from '../../view/liveViews.js';
import { playerNames } from '../../view/playerNames.js';
import { createBody, sendEngineError, toCreateInput } from './matchInput.js';
import { liveView, matchSummary } from './matchViews.js';

export interface MatchRouteDeps {
  readonly pool: DbPool;
  readonly engine: MatchEngine;
  readonly store: PgMatchStore;
  readonly dev: boolean;
  // `sbr maintenance on`: no new match is created (../../config/maintenance); the engine
  // holds every start (D22).
  readonly maintenance: MaintenanceCheck;
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

// The marks of a round the players tapped themselves (the round recap's fastest tapper).
async function manualTaps(pool: DbPool, matchId: string, roundIndex: number): Promise<string[]> {
  const r = await pool.query<{ key: string }>(
    `SELECT player_id || ':' || card_index || ':' || cell AS key FROM sbr.marks
      WHERE match_id = $1 AND round_index = $2 AND source = 'manual'`,
    [matchId, roundIndex],
  );
  return r.rows.map((row) => row.key);
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
    return { matches: matches.map((m) => matchSummary(m, viewer, deps.engine.startHeld(m))) };
  });
}

// The live view a screen folds (./matchViews), from one shared replay per match.
function registerStateRoute(app: FastifyInstance, deps: MatchRouteDeps): void {
  // One replay per match, extended as events come, for every screen's fetch.
  const views = new LiveViews({
    events: (id, afterSeq) => deps.store.events(id, afterSeq),
    names: (id) => playerNames(deps.pool, id),
    manualTaps: (id, round) => manualTaps(deps.pool, id, round),
  });
  app.get<{ Params: { code: string }; Querystring: { since?: string } }>(
    '/api/v1/matches/:code/state',
    async (request, reply) => {
      const id = await matchIdByCode(deps.pool, request.params.code);
      if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
      // Not in the match's command queue (fetches must not hold up draws): the shared
      // replay takes the logged events up to the match's current seq, so log and state
      // still belong together.
      const m = await deps.engine.runner.current(id);
      const entry = await views.entryFor(m);
      const since = Math.max(
        0,
        Math.min(entry.replay.length, Number(request.query.since ?? 0) || 0),
      );
      // The recap of the royale round just played, during the pause after it (D20).
      const recap = await views.recapFor(m, entry);
      const me = request.session?.accountId ?? null;
      return liveView({ match: m, entry, me, since, recap, startHeld: deps.engine.startHeld(m) });
    },
  );
}

export function registerMatchRoutes(app: FastifyInstance, deps: MatchRouteDeps): void {
  registerMatchList(app, deps);
  app.post('/api/v1/matches', async (request, reply) => {
    const accountId = requirePermission(request, reply, 'match.create');
    if (accountId === null) return reply;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const maintenance = deps.maintenance();
    if (maintenance !== null) {
      return reply.status(503).send({ code: 'MAINTENANCE', reason: maintenance.reason });
    }
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
    const m = await deps.engine.runner.current(id);
    return matchSummary(m, request.session?.accountId ?? null, deps.engine.startHeld(m));
  });
  registerStateRoute(app, deps);
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
