/**
 * @file   apps/server/src/http/routes/adminLeague.ts
 * @module server/http
 * @brief  The admin area's League: the league values and corrections of a player's points.
 *
 * Responsibility: GET /api/v1/admin/league (`admin.view`): the League values as form fields
 *                 (@sbr/contracts settingsFields) with value and default, and corrections. POST
 *                 /api/v1/admin/league { values, comment? } (`settings.edit`): a new version of the
 *                 `leaderboard` settings document (own keys only; the whole document must pass
 *                 LeagueSettingsSchema), applied to matches whose points are awarded afterwards.
 *                 POST …/league/corrections { displayName, delta, reason } (`league.correct`):
 *                 corrects that player's league points, 404 for no such player. Permissions checked
 *                 on the server; zod input; CSRF and limit apply; audited.
 * Depends on:     fastify, @sbr/contracts, ../../admin/settings (types), ../../db/pool (types),
 *                 ../../leaderboard/corrections, ./adminFlatSettings, ./matches (requirePermission)
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
  type LeagueSettings,
} from '@sbr/contracts';
import type { FastifyInstance } from 'fastify';

import type { SettingsStore } from '../../admin/settings.js';
import type { DbPool } from '../../db/pool.js';
import { addCorrection, recentCorrections } from '../../leaderboard/corrections.js';
import { flatFields, registerFlatSave, type FlatPage } from './adminFlatSettings.js';
import { requirePermission } from './matches.js';

export interface AdminLeagueDeps {
  readonly pool: DbPool;
  readonly settings: SettingsStore;
}

const DOCUMENT = 'leaderboard';

// The League values as a page of plain values (./adminFlatSettings).
const LEAGUE_PAGE: FlatPage<LeagueSettings> = {
  path: '/api/v1/admin/league',
  documentId: DOCUMENT,
  schema: LeagueSettingsSchema,
  catalogue: LEAGUE_CATALOGUE,
  defaults: LEAGUE_DEFAULTS,
  current: leagueSettingsOf,
  view: 'admin.view',
  edit: 'settings.edit',
};

export function registerAdminLeagueRoutes(app: FastifyInstance, deps: AdminLeagueDeps): void {
  app.get('/api/v1/admin/league', async (request, reply) => {
    if (requirePermission(request, reply, 'admin.view') === null) return reply;
    return {
      fields: flatFields(LEAGUE_PAGE, leagueSettingsOf(deps.settings.get(DOCUMENT))),
      corrections: await recentCorrections(deps.pool),
    };
  });
  registerFlatSave(app, deps.settings, LEAGUE_PAGE);

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
