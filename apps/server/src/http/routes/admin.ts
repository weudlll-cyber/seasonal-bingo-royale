/**
 * @file   apps/server/src/http/routes/admin.ts
 * @module server/http
 * @brief  The admin area's Overview: every open and running match, maintenance, a health line.
 *
 * Responsibility: GET /api/v1/admin/overview (`admin.view`): matches in lobby or running, newest
 *                 first, with host and players; maintenance state and reason; the switches; version
 *                 and uptime. POST /api/v1/admin/matches/:code/abort { reason } (`match.abort`):
 *                 any match not over, stopped as the system does it (players read the reason). POST
 *                 /api/v1/admin/maintenance { on, reason } (`maintenance.manage`): the same flag
 *                 file `sbr maintenance` writes. Every change goes to the audit log first-hand
 *                 (../../admin/audit). Permissions checked on the server; zod input; session limit
 *                 and CSRF apply.
 * Depends on:     fastify, zod, @sbr/application, ../../admin/audit, ../../config/maintenance,
 *                 ../../db/pool, ../../match/records, ./matches (requirePermission), ./matchInput
 * Used by:        ../app
 * Spec:           docs/concepts/admin-area.md §4 (Overview), §9 piece 1; docs/spec/09-deployment-architecture.md §4
 */
import type { MatchEngine } from '@sbr/application';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { recordAudit } from '../../admin/audit.js';
import type { Switches } from '../../config/features.js';
import { setMaintenance, type MaintenanceCheck } from '../../config/maintenance.js';
import type { DbPool } from '../../db/pool.js';
import { matchIdByCode } from '../../match/records.js';
import { requirePermission } from './matches.js';
import { sendEngineError } from './matchInput.js';

export interface AdminDeps {
  readonly pool: DbPool;
  readonly engine: MatchEngine;
  readonly maintenance: MaintenanceCheck;
  readonly dataDir: string;
  // The installed version (SBR_VERSION, set when the image is built), and when the server began.
  readonly version: string;
  readonly startedAt: number;
  // The switches as they are now (guests, e-mail verification; ./adminSettings changes them).
  readonly switches: () => Switches;
}

const abortBody = z.object({ reason: z.string().trim().min(3).max(200) });
const maintenanceBody = z.object({
  on: z.boolean(),
  reason: z.string().trim().max(200).optional(),
});

const OPEN_MATCHES = `
  SELECT m.code, m.title, m.game_type, m.mode, m.status, m.max_players, m.created_at,
         m.starts_at, a.display_name AS host,
         (SELECT count(*) FROM sbr.match_entries e WHERE e.match_id = m.id)::int AS players
    FROM sbr.matches m LEFT JOIN sbr.accounts a ON a.id = m.created_by
   WHERE m.status IN ('lobby', 'running')
   ORDER BY m.created_at DESC`;

interface OpenMatchRow {
  code: string;
  title: string;
  game_type: string;
  mode: string;
  status: string;
  max_players: number;
  created_at: Date;
  starts_at: Date | null;
  host: string | null;
  players: number;
}

async function overview(deps: AdminDeps) {
  const rows = await deps.pool.query<OpenMatchRow>(OPEN_MATCHES);
  const now = deps.maintenance();
  return {
    matches: rows.rows.map((r) => ({
      code: r.code,
      title: r.title,
      gameType: r.game_type,
      mode: r.mode,
      status: r.status,
      players: r.players,
      maxPlayers: r.max_players,
      host: r.host,
      createdAt: r.created_at.getTime(),
      startsAt: r.starts_at?.getTime() ?? null,
    })),
    maintenance: { on: now !== null, reason: now?.reason ?? null },
    switches: deps.switches(),
    health: { version: deps.version, startedAt: deps.startedAt },
  };
}

// The caller's account when it holds the permission; otherwise the refusal is sent.
const allowed = (request: FastifyRequest, reply: FastifyReply, permission: string) =>
  requirePermission(request, reply, permission);

export function registerAdminRoutes(app: FastifyInstance, deps: AdminDeps): void {
  app.get('/api/v1/admin/overview', async (request, reply) => {
    if (allowed(request, reply, 'admin.view') === null) return reply;
    return overview(deps);
  });

  app.post<{ Params: { code: string } }>(
    '/api/v1/admin/matches/:code/abort',
    async (request, reply) => {
      const actor = allowed(request, reply, 'match.abort');
      if (actor === null) return reply;
      const body = abortBody.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
      const id = await matchIdByCode(deps.pool, request.params.code);
      if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
      try {
        await deps.engine.abort(id, body.data.reason, 'system');
      } catch (error) {
        return sendEngineError(reply, error);
      }
      await recordAudit(deps.pool, {
        actorAccountId: actor,
        action: 'match.abort',
        targetType: 'match',
        targetId: request.params.code,
        diff: { reason: body.data.reason },
        requestId: request.id,
      });
      return reply.status(204).send();
    },
  );

  app.post('/api/v1/admin/maintenance', async (request, reply) => {
    const actor = allowed(request, reply, 'maintenance.manage');
    if (actor === null) return reply;
    const body = maintenanceBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const before = deps.maintenance();
    const reason = body.data.on ? (body.data.reason ?? '') : null;
    setMaintenance(deps.dataDir, reason);
    await recordAudit(deps.pool, {
      actorAccountId: actor,
      action: body.data.on ? 'maintenance.on' : 'maintenance.off',
      targetType: 'maintenance',
      targetId: 'flag',
      diff: { from: before === null ? null : (before.reason ?? ''), to: reason },
      requestId: request.id,
    });
    return { on: reason !== null, reason: reason === '' ? null : reason };
  });
}
