/**
 * @file   apps/server/src/http/routes/matches.ts
 * @module server/http
 * @brief  Match routes under /api/v1: list, create, detail, state, join, start, host controls.
 *
 * Responsibility: GET /matches (open, running and recent matches, and as `mine` the
 *                 signed-in player's matches not over, ./myMatches, D39), POST /matches (match.create;
 *                 503 MAINTENANCE while `sbr maintenance on`, except for the load check's host,
 *                 12 §5), GET /matches/:code, GET
 *                 /matches/:code/state?since= (the live view the client folds, ./matchViews; in
 *                 the pause after a royale round with the round's recap, D20; a watching screen
 *                 adds &follow= and &known=, D24), POST /matches/:code/join (match.join), GET
 *                 /matches/:code/away-summary (./awaySummary), the host's routes (./matchHost:
 *                 start, draws, abort, the mark fallback; in development /bots). Engine errors
 *                 become 4xx with their code.
 * Depends on:     fastify, zod, @sbr/application, ../../match/*, ../../db/pool,
 *                 ../../config/maintenance, ./awaySummary, ./matchHost, ./matchInput, ./matchViews,
 *                 ./myMatches,
 *                 ../../view/liveViews (types), ../../view/watchView
 * Used by:        ../app, ./matchHost, ./awaySummary, ./timeTravel
 * Spec:           docs/spec/05-api-design.md §2.3, §3; docs/spec/11-admin-panel.md §3.2; docs/spec/01-game-design.md §5, §6
 */
import type { MaintenanceCheck } from '../../config/maintenance.js';
import type { LiveMetrics } from './metrics.js';
import type { MatchEngine } from '@sbr/application';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import type { PgMatchStore } from '../../match/pgMatchStore.js';
import { registerAwaySummary } from './awaySummary.js';
import { registerHostRoutes } from './matchHost.js';
import { myMatches } from './myMatches.js';
import type { LiveViews } from '../../view/liveViews.js';
import type { WatchQuery } from '../../view/watchView.js';
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
  // What building the state answers costs (./metrics, 12 §5); none in tests that do not measure.
  readonly live?: LiveMetrics;
  // The server's one replay per live match (../../view/liveViews).
  readonly views: LiveViews;
  // Website mode: matches may be shown on the website (D50); standalone never.
  readonly website: boolean;
}

// The operator's load-check host (role load_check, made only by the CLI) creates and starts
// its match also while maintenance is on (12 §5); every other account is refused.
export function maintenanceExempt(request: FastifyRequest): boolean {
  return request.session?.permissions.includes('match.loadcheck') === true;
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
    const summaries = matches.map((m) => matchSummary(m, viewer, deps.engine.clockFacts(m)));
    // The caller's own matches in the same answer, so the lobby never shows two states (D39).
    const mine = viewer === null ? [] : await myMatches(deps.pool, viewer, summaries);
    return { matches: summaries, mine };
  });
}

// The live view a screen folds (./matchViews), from one shared replay per match.
function registerStateRoute(app: FastifyInstance, deps: MatchRouteDeps): void {
  // One replay per match, shared with the live frames (../../realtime/liveSteps).
  const views = deps.views;
  app.get<{ Params: { code: string }; Querystring: WatchParams & { since?: string } }>(
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
      const clock = deps.engine.clockFacts(m);
      const watch = watchQuery(request.query);
      // Built and serialized here after every wait, so the size and the building time (not the
      // waiting) are measured once.
      const started = Date.now();
      const body = JSON.stringify(liveView({ match: m, entry, me, since, recap, clock, watch }));
      deps.live?.built('fetch', Date.now() - started, body.length);
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );
}

// A watching screen (D24): `follow` a player still in; `known=<round>:<name>,<name>` the
// cards it already holds for that round, so they are not sent again.
interface WatchParams {
  readonly follow?: string;
  readonly known?: string;
}

function watchQuery(q: WatchParams): WatchQuery {
  const [round = '', names = ''] = (q.known ?? '').split(':');
  const knownRound = /^\d{1,3}$/.test(round) ? Number(round) : null;
  const follow = q.follow !== undefined && q.follow.length <= 64 ? q.follow : null;
  return {
    follow,
    knownRound,
    known: names
      .split(',')
      .filter((n) => n.length > 0)
      .slice(0, 8),
  };
}

// "Show on the Seasonal Entertainment website": website mode only, off unless ticked.
const website = (deps: MatchRouteDeps, body: { showOnWebsite?: boolean | undefined }) =>
  deps.website && body.showOnWebsite === true;

export function registerMatchRoutes(app: FastifyInstance, deps: MatchRouteDeps): void {
  registerMatchList(app, deps);
  app.post('/api/v1/matches', async (request, reply) => {
    const accountId = requirePermission(request, reply, 'match.create');
    if (accountId === null) return reply;
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const maintenance = deps.maintenance();
    if (maintenance !== null && !maintenanceExempt(request)) {
      return reply.status(503).send({ code: 'MAINTENANCE', reason: maintenance.reason });
    }
    // The fast test profile exists in development builds only.
    if (parsed.data.testProfile !== undefined && !deps.dev) {
      return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    }
    try {
      const input = { ...toCreateInput(parsed.data), showOnWebsite: website(deps, parsed.data) };
      const record = await deps.engine.create(input, accountId);
      return await reply.status(201).send({ code: record.code, id: record.id });
    } catch (error) {
      return sendEngineError(reply, error);
    }
  });
  app.get<{ Params: { code: string } }>('/api/v1/matches/:code', async (request, reply) => {
    const id = await matchIdByCode(deps.pool, request.params.code);
    if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
    const m = await deps.engine.runner.current(id);
    return matchSummary(m, request.session?.accountId ?? null, deps.engine.clockFacts(m));
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
  registerAwaySummary(app, deps);
}
