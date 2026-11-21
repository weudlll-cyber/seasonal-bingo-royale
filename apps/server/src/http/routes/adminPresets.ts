/**
 * @file   apps/server/src/http/routes/adminPresets.ts
 * @module server/http
 * @brief  The admin area's Presets: list them, change their values, duplicate, publish, retire.
 *
 * Responsibility: GET /api/v1/admin/presets (`admin.view`): every preset with its values as
 *                 form fields (@sbr/contracts presetFields: name, what it does, unit, min/max
 *                 from the schema, warning), each with its current value and its built-in
 *                 default. POST /api/v1/admin/presets/:id { values, comment? }: sets the named
 *                 values (only paths the preset's fields offer). POST …/:id/duplicate { name,
 *                 comment? }: a new draft with the same rules. POST …/:id/status { status,
 *                 comment? }: publish or retire; the last published preset of a game type and
 *                 mode cannot be retired (409 LAST_PUBLISHED). Changes need `settings.edit`,
 *                 pass the full RulesetSchema (../../admin/presets `problem`), are new versions
 *                 with an audit entry, and apply to matches created afterwards (§8 (b)). Input
 *                 through zod; the session plugin's limit and CSRF apply.
 * Depends on:     node:crypto, fastify, zod, @sbr/application, @sbr/contracts,
 *                 ../../admin/presets, ../../admin/settings (types), ./matches (requirePermission)
 * Used by:        ../gameRoutes
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §6, §8 (b), (r), §9 piece 3
 */
import { randomUUID } from 'node:crypto';

import { defaultRulesetFor } from '@sbr/application';
import { presetFields, readPath, writePath } from '@sbr/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { PRESET_PREFIX, type Preset, type Presets } from '../../admin/presets.js';
import type { SettingsStore } from '../../admin/settings.js';
import { requirePermission } from './matches.js';

export interface AdminPresetsDeps {
  readonly settings: SettingsStore;
  readonly presets: Presets;
}

const idParams = z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/) });
const comment = z.string().trim().max(200).optional();
const valuesBody = z.strictObject({
  values: z.record(z.string().max(80), z.union([z.number(), z.boolean(), z.string().max(40)])),
  comment,
});
const duplicateBody = z.strictObject({ name: z.string().trim().min(3).max(60), comment });
const statusBody = z.strictObject({ status: z.enum(['published', 'retired']), comment });

// A preset as the page shows it: its facts and its values as form fields.
function presetView(id: string, p: Preset) {
  const builtIn = defaultRulesetFor(p.gameType, p.mode);
  return {
    id,
    name: p.name,
    gameType: p.gameType,
    mode: p.mode,
    status: p.status,
    fields: presetFields(p.ruleset).map((f) => ({
      ...f,
      value: readPath(p.ruleset, f.path),
      default: readPath(builtIn, f.path),
    })),
  };
}

type Edit = (p: Preset) => Preset | 'invalid';

// The checks every change shares: permission, the preset, its input; then the new version.
async function changePreset<B>(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  deps: AdminPresetsDeps,
  input: {
    schema: z.ZodType<B>;
    edit: (body: B) => Edit;
    comment: (body: B) => string | undefined;
  },
) {
  const actor = requirePermission(request, reply, 'settings.edit');
  if (actor === null) return reply;
  const params = idParams.safeParse(request.params);
  const body = input.schema.safeParse(request.body);
  if (!params.success || !body.success)
    return reply.status(400).send({ code: 'VALIDATION_FAILED' });
  const documentId = `${PRESET_PREFIX}${params.data.id}`;
  const before = deps.presets.get(params.data.id);
  if (before === null) return reply.status(404).send({ code: 'NOT_FOUND' });
  const next = input.edit(body.data)(before);
  const problem = next === 'invalid' ? 'invalid' : deps.presets.problem(documentId, next);
  if (problem === 'lastPublished') return reply.status(409).send({ code: 'LAST_PUBLISHED' });
  if (problem !== null || next === 'invalid')
    return reply.status(400).send({ code: 'VALIDATION_FAILED' });
  const text = input.comment(body.data);
  await deps.settings.change({
    documentId,
    next,
    actorAccountId: actor,
    comment: text === undefined || text === '' ? null : text,
    requestId: request.id,
  });
  return { preset: presetView(params.data.id, next) };
}

// The named values set on the preset's ruleset, each one a path its fields offer.
const setValues =
  (values: Readonly<Record<string, unknown>>): Edit =>
  (p) => {
    const offered = new Set(presetFields(p.ruleset).map((f) => f.path));
    let ruleset: unknown = p.ruleset;
    for (const [path, value] of Object.entries(values)) {
      if (!offered.has(path)) return 'invalid';
      ruleset = writePath(ruleset, path, value);
    }
    return { ...p, ruleset: ruleset as Preset['ruleset'] };
  };

export function registerAdminPresetRoutes(app: FastifyInstance, deps: AdminPresetsDeps): void {
  app.get('/api/v1/admin/presets', async (request, reply) => {
    if (requirePermission(request, reply, 'admin.view') === null) return reply;
    return { presets: deps.presets.list().map((e) => presetView(e.id, e.preset)) };
  });

  type WithId = { Params: { id: string } };
  app.post<WithId>('/api/v1/admin/presets/:id', (request, reply) =>
    changePreset(request, reply, deps, {
      schema: valuesBody,
      edit: (b) => setValues(b.values),
      comment: (b) => b.comment,
    }),
  );

  app.post<WithId>('/api/v1/admin/presets/:id/status', (request, reply) =>
    changePreset(request, reply, deps, {
      schema: statusBody,
      edit: (b) => (p) => ({
        ...p,
        status: b.status,
        publishedAt: b.status === 'published' ? Date.now() : p.publishedAt,
      }),
      comment: (b) => b.comment,
    }),
  );

  app.post<WithId>('/api/v1/admin/presets/:id/duplicate', async (request, reply) => {
    const actor = requirePermission(request, reply, 'settings.edit');
    if (actor === null) return reply;
    const params = idParams.safeParse(request.params);
    const body = duplicateBody.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const from = deps.presets.get(params.data.id);
    if (from === null) return reply.status(404).send({ code: 'NOT_FOUND' });
    const id = `${from.gameType}-${from.mode}-${randomUUID().slice(0, 8)}`;
    const copy: Preset = { ...from, name: body.data.name, status: 'draft', publishedAt: null };
    await deps.settings.create({
      documentId: `${PRESET_PREFIX}${id}`,
      next: copy,
      actorAccountId: actor,
      comment:
        body.data.comment === undefined || body.data.comment === '' ? null : body.data.comment,
      requestId: request.id,
    });
    return reply.status(201).send({ preset: presetView(id, copy) });
  });
}
