/**
 * @file   apps/server/src/http/routes/adminLeague.ts
 * @module server/http
 * @brief  The admin area's League: the league values and corrections of a player's points.
 *
 * Responsibility: GET /api/v1/admin/league (`admin.view`): the League values as form fields
 *                 (@sbr/contracts settingsFields: name, what it does, unit, the schema's
 *                 limits), each with its current value and today's default, and the latest
 *                 corrections. POST /api/v1/admin/league { values, comment? } (`settings.edit`):
 *                 a new version of the `leaderboard` settings document (only its own keys; the
 *                 whole document must pass LeagueSettingsSchema), applied to every match whose
 *                 points are awarded afterwards. POST /api/v1/admin/league/corrections
 *                 { displayName, delta, reason } (`league.correct`): a correction of that
 *                 player's league points (../../leaderboard/corrections), 404 for no such player.
 *                 The server checks every permission; input through zod; the session plugin's
 *                 limit and CSRF apply; every change is audited.
 * Depends on:     fastify, zod, @sbr/contracts, ../../admin/settings (types), ../../db/pool
 *                 (types), ../../leaderboard/corrections, ./matches (requirePermission)
 * Used by:        ../gameRoutes
 * Spec:           docs/concepts/admin-area.md §4 (League), §6, §8 (b), §9 piece 5
 */
import {
  CorrectionSchema,
  LEAGUE_CATALOGUE,
  LEAGUE_DEFAULTS,
  leagueConfigOf,
  leagueSettingsOf,
  LeagueSettingsSchema,
  settingsFields,
} from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { SettingsStore } from '../../admin/settings.js';
import type { DbPool } from '../../db/pool.js';
import { addCorrection, recentCorrections } from '../../leaderboard/corrections.js';
import { requirePermission } from './matches.js';

export interface AdminLeagueDeps {
  readonly pool: DbPool;
  readonly settings: SettingsStore;
}

const DOCUMENT = 'leaderboard';

const valuesBody = z.strictObject({
  values: z.record(z.string().max(40), z.union([z.number(), z.boolean()])),
  comment: z.string().trim().max(200).optional(),
});

export function registerAdminLeagueRoutes(app: FastifyInstance, deps: AdminLeagueDeps): void {
  app.get('/api/v1/admin/league', async (request, reply) => {
    if (requirePermission(request, reply, 'admin.view') === null) return reply;
    const current = leagueSettingsOf(deps.settings.get(DOCUMENT));
    return {
      fields: settingsFields(LeagueSettingsSchema, current, LEAGUE_CATALOGUE).map((f) => ({
        ...f,
        value: current[f.path as keyof typeof current],
        default: LEAGUE_DEFAULTS[f.path as keyof typeof LEAGUE_DEFAULTS],
      })),
      corrections: await recentCorrections(deps.pool),
    };
  });

  app.post('/api/v1/admin/league', async (request, reply) => {
    const actor = requirePermission(request, reply, 'settings.edit');
    if (actor === null) return reply;
    const body = valuesBody.safeParse(request.body);
    const keys = Object.keys(body.data?.values ?? {});
    const next = LeagueSettingsSchema.safeParse({
      ...leagueSettingsOf(deps.settings.get(DOCUMENT)),
      ...body.data?.values,
    });
    if (!body.success || !next.success || keys.some((k) => !(k in LEAGUE_CATALOGUE)))
      return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const comment = body.data.comment;
    const version = await deps.settings.change({
      documentId: DOCUMENT,
      next: next.data,
      actorAccountId: actor,
      comment: comment === undefined || comment === '' ? null : comment,
      requestId: request.id,
    });
    return { version, league: next.data };
  });

  app.post('/api/v1/admin/league/corrections', async (request, reply) => {
    const actor = requirePermission(request, reply, 'league.correct');
    if (actor === null) return reply;
    const body = CorrectionSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const player = await deps.pool.query<{ id: string }>(
      'SELECT id FROM sbr.accounts WHERE display_name = $1',
      [body.data.displayName],
    );
    const account = player.rows[0];
    if (account === undefined) return reply.status(404).send({ code: 'NOT_FOUND' });
    const id = await addCorrection(deps.pool, {
      accountId: account.id,
      delta: body.data.delta,
      reason: body.data.reason,
      actorAccountId: actor,
      requestId: request.id,
      at: Date.now(),
      config: leagueConfigOf(leagueSettingsOf(deps.settings.get(DOCUMENT))),
    });
    return reply.status(201).send({ id });
  });
}
