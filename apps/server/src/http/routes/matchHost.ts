/**
 * @file   apps/server/src/http/routes/matchHost.ts
 * @module server/http
 * @brief  Host routes of a match: start, draw next, draw mode, abort, bots; the mark fallback.
 *
 * Responsibility: only the match's creator with `match.manage` runs it (05 §3, 06 §4.1):
 *                 POST /start (10-second countdown), /draw-next (host mode, D8), PUT
 *                 /draw-mode { mode, intervalMs } at any time, POST /abort { reason }.
 *                 Development builds add POST /bots { upTo } to fill the lobby with bots.
 *                 POST /marks { cardIndex, cell } lets a player without a socket tap.
 * Depends on:     fastify, zod, ./matches, ./matchInput
 * Used by:        ./matches
 * Spec:           docs/spec/05-api-design.md §2.3, §3; docs/spec/06-realtime-architecture.md §4.1; docs/spec/11-admin-panel.md §3.2
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { matchIdByCode, requirePermission, type MatchRouteDeps } from './matches.js';
import { sendEngineError } from './matchInput.js';

export const START_COUNTDOWN_MS = 10_000;

type CodeRequest = FastifyRequest<{ Params: { code: string } }>;

const drawModeBody = z.object({
  mode: z.enum(['auto', 'host']),
  intervalMs: z.number().int().min(1).max(3_600_000).optional(),
});
const abortBody = z.object({ reason: z.string().trim().min(3).max(200) });
const botsBody = z.object({ upTo: z.number().int().min(2).max(200) });
const markBody = z.object({
  cardIndex: z.number().int().min(0).max(3),
  cell: z.number().int().min(0).max(24),
});

// The match id when the caller created it and holds match.manage; otherwise answers.
async function hostedMatch(
  deps: MatchRouteDeps,
  request: CodeRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const accountId = requirePermission(request, reply, 'match.manage');
  if (accountId === null) return null;
  const id = await matchIdByCode(deps.pool, request.params.code);
  if (id === null) {
    await reply.status(404).send({ code: 'NOT_FOUND' });
    return null;
  }
  const m = await deps.engine.runner.current(id);
  if (m.record.createdBy !== accountId) {
    await reply.status(403).send({ code: 'NOT_YOUR_MATCH' });
    return null;
  }
  return id;
}

export function registerHostRoutes(app: FastifyInstance, deps: MatchRouteDeps): void {
  const host = (path: string, run: (id: string, request: CodeRequest) => Promise<unknown>) => {
    app.post<{ Params: { code: string } }>(path, async (request, reply) => {
      const id = await hostedMatch(deps, request, reply);
      if (id === null) return reply;
      try {
        const body = await run(id, request);
        return await reply.status(200).send(body ?? {});
      } catch (error) {
        return sendEngineError(reply, error);
      }
    });
  };
  host('/api/v1/matches/:code/start', async (id) => ({
    startsAt: await deps.engine.start(id, START_COUNTDOWN_MS),
  }));
  host('/api/v1/matches/:code/draw-next', (id) => deps.engine.drawNext(id));
  host('/api/v1/matches/:code/draw-mode', async (id, request) => {
    const body = drawModeBody.parse(request.body);
    const record = await deps.engine.setDrawControl(id, body.mode, body.intervalMs);
    return { settings: record.settings };
  });
  host('/api/v1/matches/:code/abort', (id, request) =>
    deps.engine.abort(id, abortBody.parse(request.body).reason),
  );
  // Development only: fill the lobby with bots so the host can try a match alone.
  if (deps.dev) {
    host('/api/v1/matches/:code/bots', (id, request) =>
      deps.engine.fillWithBots(id, botsBody.parse(request.body).upTo),
    );
  }
  app.post<{ Params: { code: string } }>('/api/v1/matches/:code/marks', async (request, reply) => {
    const accountId = requirePermission(request, reply, 'match.join');
    if (accountId === null) return reply;
    const id = await matchIdByCode(deps.pool, request.params.code);
    const body = markBody.safeParse(request.body);
    if (id === null || !body.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const ok = await deps.engine.mark(id, accountId, body.data.cardIndex, body.data.cell);
    return reply.status(ok ? 200 : 422).send(ok ? {} : { code: 'MARK_REJECTED' });
  });
}
