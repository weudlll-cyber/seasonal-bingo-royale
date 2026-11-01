/**
 * @file   apps/server/src/http/routes/profiles.ts
 * @module server/http
 * @brief  GET /api/v1/players/:displayName (public profile) and GET /api/v1/me/export (05 §2.2).
 *
 * Responsibility: a player's public profile for anyone, by display name (404 NOT_FOUND for
 *                 an unknown or impossible name); the signed-in caller's own data as a JSON
 *                 download (03 §19; 401 SIGN_IN_REQUIRED without an account), never cached.
 *                 DELETE /me lives with the other account routes (./auth).
 * Depends on:     fastify, @sbr/contracts (types), ../../db/pool, ../../leaderboard/profiles,
 *                 ../../leaderboard/accountExport
 * Used by:        ../app
 * Spec:           docs/spec/05-api-design.md §2.2; docs/spec/03-security-architecture.md §19
 */
import type { PlayerProfile } from '@sbr/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import { accountExport } from '../../leaderboard/accountExport.js';
import { playerProfile } from '../../leaderboard/profiles.js';

// A display name as registration allows it (./auth registerBody).
const DISPLAY_NAME = /^[\p{L}\p{N}_.-]{3,24}$/u;

export function registerProfileRoutes(app: FastifyInstance, deps: { pool: DbPool }): void {
  app.get(
    '/api/v1/players/:displayName',
    async (request: FastifyRequest<{ Params: { displayName: string } }>, reply) => {
      const name = request.params.displayName;
      const profile = DISPLAY_NAME.test(name) ? await playerProfile(deps.pool, name) : null;
      if (profile === null) return reply.status(404).send({ code: 'NOT_FOUND' });
      return profile satisfies PlayerProfile;
    },
  );
  app.get('/api/v1/me/export', async (request, reply) => {
    const accountId = request.session?.accountId ?? null;
    if (accountId === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
    const data = await accountExport(deps.pool, accountId, new Date());
    if (data === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
    return reply
      .header('cache-control', 'no-store')
      .header('content-disposition', 'attachment; filename="seasonal-bingo-royale-data.json"')
      .send(data);
  });
}
