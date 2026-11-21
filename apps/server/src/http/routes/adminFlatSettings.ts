/**
 * @file   apps/server/src/http/routes/adminFlatSettings.ts
 * @module server/http
 * @brief  The admin area's pages of plain values: their fields, and saving them as a new version.
 *
 * Responsibility: for a settings document whose values sit at the top level (League, Screens
 *                 and texts, Technical): `flatFields` — its values as form fields (@sbr/contracts
 *                 settingsFields: name, what it does, unit, the schema's limits) with the current
 *                 value and today's default; `registerFlatSettings` — GET <path> (`admin.view`
 *                 unless the page names another permission) with the fields, and POST <path>
 *                 { values, comment? } (the page's edit permission): only the document's own
 *                 keys, the whole document must pass its schema, a new version with its audit
 *                 entry (../../admin/settings). Input through zod; the session plugin's limit
 *                 and CSRF apply.
 * Depends on:     fastify, zod, @sbr/contracts (settingsFields, types), ../../admin/settings
 *                 (types), ./matches (requirePermission)
 * Used by:        ./adminLeague, ../gameRoutes (Screens and texts)
 * Spec:           docs/concepts/admin-area.md §4, §6, §9 pieces 5 to 7
 */
import { settingsFields, type CatalogueEntry } from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SettingsStore } from '../../admin/settings.js';
import { requirePermission } from './matches.js';

export interface FlatPage<T extends Record<string, unknown>> {
  readonly path: string;
  readonly documentId: string;
  readonly schema: z.ZodObject;
  readonly catalogue: Readonly<Record<string, CatalogueEntry>>;
  readonly defaults: T;
  // The stored document over the defaults.
  readonly current: (document: Readonly<Record<string, unknown>>) => T;
  readonly view: string;
  readonly edit: string;
}

const valuesBody = z.strictObject({
  values: z.record(z.string().max(40), z.union([z.number(), z.boolean(), z.string().max(200)])),
  comment: z.string().trim().max(200).optional(),
});

export function flatFields<T extends Record<string, unknown>>(page: FlatPage<T>, current: T) {
  return settingsFields(page.schema, current, page.catalogue).map((f) => ({
    ...f,
    value: current[f.path],
    default: page.defaults[f.path],
  }));
}

export function registerFlatSave<T extends Record<string, unknown>>(
  app: FastifyInstance,
  settings: SettingsStore,
  page: FlatPage<T>,
): void {
  app.post(page.path, async (request, reply) => {
    const actor = requirePermission(request, reply, page.edit);
    if (actor === null) return reply;
    const body = valuesBody.safeParse(request.body);
    const keys = Object.keys(body.data?.values ?? {});
    const next = page.schema.safeParse({
      ...page.current(settings.get(page.documentId)),
      ...body.data?.values,
    });
    if (!body.success || !next.success || keys.some((k) => !(k in page.catalogue)))
      return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const comment = body.data.comment;
    const version = await settings.change({
      documentId: page.documentId,
      next: next.data,
      actorAccountId: actor,
      comment: comment === undefined || comment === '' ? null : comment,
      requestId: request.id,
    });
    return { version, values: next.data };
  });
}

export function registerFlatSettings<T extends Record<string, unknown>>(
  app: FastifyInstance,
  settings: SettingsStore,
  page: FlatPage<T>,
): void {
  app.get(page.path, async (request, reply) => {
    if (requirePermission(request, reply, page.view) === null) return reply;
    return { fields: flatFields(page, page.current(settings.get(page.documentId))) };
  });
  registerFlatSave(app, settings, page);
}
