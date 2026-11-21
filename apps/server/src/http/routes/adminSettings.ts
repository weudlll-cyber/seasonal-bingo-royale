/**
 * @file   apps/server/src/http/routes/adminSettings.ts
 * @module server/http
 * @brief  The admin area's settings: the Overview's switches, the History and its undo.
 *
 * Responsibility: POST /api/v1/admin/switches { guests, emailVerification, comment? }
 *                 (`settings.edit`): a new version of the `features` settings document, applied
 *                 at once (../../admin/settings). GET /api/v1/admin/history?before=<id>
 *                 (`admin.view`): every change made in the admin area, newest first, 50 at a
 *                 time, with who made it (the account's name, or none once it is gone), what
 *                 changed (old and new) and its comment; settings changes can be undone. POST
 *                 /api/v1/admin/history/:id/undo (`settings.edit`): undoes that settings change
 *                 as a new version (admin-area §6, §8 (k)); 404 for no such change, 409 when
 *                 nothing is left to undo or the undo would leave a preset invalid or no preset
 *                 of its kind published. The server checks every permission; input through
 *                 zod; the session plugin's limit and CSRF apply; every change is audited.
 * Depends on:     fastify, zod, ../../admin/presets, ../../admin/settings, ../../db/pool,
 *                 ./matches (requirePermission)
 * Used by:        ../app
 * Spec:           docs/concepts/admin-area.md §4 (Overview, History), §6, §8 (k), (p), §9 piece 2
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { PRESET_PREFIX, type Presets } from '../../admin/presets.js';
import type { SettingsStore } from '../../admin/settings.js';
import type { DbPool } from '../../db/pool.js';
import { requirePermission } from './matches.js';

export interface AdminSettingsDeps {
  readonly pool: DbPool;
  readonly settings: SettingsStore;
  readonly presets: Presets;
  // Per document, what the environment gives the values a version leaves out (§8 (p)), so
  // the History can name the value in effect before a first change.
  readonly defaults: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

const switchesBody = z.strictObject({
  guests: z.boolean(),
  emailVerification: z.boolean(),
  comment: z.string().trim().max(200).optional(),
});
const historyQuery = z.object({ before: z.coerce.number().int().positive().optional() });
const undoParams = z.object({ id: z.coerce.number().int().positive() });

const PAGE = 50;

const HISTORY = `
  SELECT l.id, l.occurred_at, l.action, l.target_type, l.target_id, l.diff,
         a.display_name AS actor, t.display_name AS target_name
    FROM sbr.audit_log l LEFT JOIN sbr.accounts a ON a.id = l.actor_account_id
         LEFT JOIN sbr.accounts t
           ON l.target_type = 'account' AND t.id::text = l.target_id
   WHERE $1::bigint IS NULL OR l.id < $1
   ORDER BY l.id DESC LIMIT ${String(PAGE)}`;

interface HistoryRow {
  id: string;
  occurred_at: Date;
  action: string;
  target_type: string;
  target_id: string;
  diff: Record<string, unknown>;
  actor: string | null;
  // An account the change was about (a correction), by name while it exists.
  target_name: string | null;
}

// "features@3": the settings document and version a settings change wrote.
function settingsTarget(row: { target_type: string; target_id: string }) {
  const m = /^([a-zA-Z0-9_:-]+)@(\d+)$/.exec(row.target_id);
  if (row.target_type !== 'settings' || m === null) return null;
  return { documentId: m[1] ?? '', version: Number(m[2]) };
}

export function registerAdminSettingsRoutes(app: FastifyInstance, deps: AdminSettingsDeps): void {
  app.post('/api/v1/admin/switches', async (request, reply) => {
    const actor = requirePermission(request, reply, 'settings.edit');
    if (actor === null) return reply;
    const body = switchesBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const { comment, ...next } = body.data;
    const version = await deps.settings.change({
      documentId: 'features',
      next,
      actorAccountId: actor,
      comment: comment === undefined || comment === '' ? null : comment,
      requestId: request.id,
    });
    return { version, switches: next };
  });

  app.get('/api/v1/admin/history', async (request, reply) => {
    if (requirePermission(request, reply, 'admin.view') === null) return reply;
    const query = historyQuery.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const rows = await deps.pool.query<HistoryRow>(HISTORY, [query.data.before ?? null]);
    return {
      entries: rows.rows.map((r) => ({
        id: Number(r.id),
        at: r.occurred_at.getTime(),
        actor: r.actor,
        action: r.action,
        target: r.target_type === 'account' ? (r.target_name ?? 'a removed account') : r.target_id,
        diff: r.diff,
        undoable: settingsTarget(r) !== null,
      })),
      more: rows.rows.length === PAGE,
      defaults: deps.defaults,
    };
  });

  app.post<{ Params: { id: string } }>('/api/v1/admin/history/:id/undo', (request, reply) =>
    undoChange(request, reply, deps),
  );
}

// Undo of one settings change, as a new version (see the header).
async function undoChange(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  deps: AdminSettingsDeps,
) {
  const actor = requirePermission(request, reply, 'settings.edit');
  if (actor === null) return reply;
  const params = undoParams.safeParse(request.params);
  if (!params.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
  const row = await deps.pool.query<{ target_type: string; target_id: string }>(
    'SELECT target_type, target_id FROM sbr.audit_log WHERE id = $1',
    [params.data.id],
  );
  const target = row.rows[0] === undefined ? null : settingsTarget(row.rows[0]);
  if (target === null) return reply.status(404).send({ code: 'NOT_FOUND' });
  const { documentId } = target;
  const version = await deps.settings.undo({
    documentId,
    undone: target.version,
    actorAccountId: actor,
    requestId: request.id,
    // A preset must stay a valid one with a published preset left (../../admin/presets).
    accept: (doc) =>
      !documentId.startsWith(PRESET_PREFIX) || deps.presets.problem(documentId, doc) === null,
  });
  if (version === 'nothing') return reply.status(409).send({ code: 'NOTHING_TO_UNDO' });
  if (version === 'refused') return reply.status(409).send({ code: 'UNDO_REFUSED' });
  return { version };
}
