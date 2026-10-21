/**
 * @file   apps/server/src/http/routes/devSignIn.ts
 * @module server/http
 * @brief  Development-only quick sign-in: host and three players without a password.
 *
 * Responsibility: POST /api/v1/dev/sign-in { as: 'host' | 'player-1' | 'player-2' |
 *                 'player-3' } creates on first use, or reuses, the account `dev-host`
 *                 (role organizer) or `dev-player-N` and starts a session for it, so the
 *                 owner can try host and players alone in several browser windows. The app
 *                 registers this route only when NODE_ENV is not production; a test proves
 *                 a production build answers 404.
 * Depends on:     fastify, zod, ../../auth/*, ../../db/pool
 * Used by:        ../app
 * Spec:           docs/spec/15-implementation-plan.md WP-09 (draft), docs/spec/12-testing-strategy.md §8
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ensureDevAccount } from '../../auth/accounts.js';
import { setSessionCookie, type CookieConfig } from '../../auth/sessionPlugin.js';
import { createSession, revokeSession } from '../../auth/sessions.js';
import type { DbPool } from '../../db/pool.js';

const DEV_ACCOUNTS = {
  host: { displayName: 'dev-host', roles: ['organizer'] },
  'player-1': { displayName: 'dev-player-1', roles: [] },
  'player-2': { displayName: 'dev-player-2', roles: [] },
  'player-3': { displayName: 'dev-player-3', roles: [] },
} as const;

const body = z.object({ as: z.enum(['host', 'player-1', 'player-2', 'player-3']) });

export function registerDevSignIn(
  app: FastifyInstance,
  deps: { readonly pool: DbPool; readonly cookie: CookieConfig },
): void {
  app.post('/api/v1/dev/sign-in', async (request, reply) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const who = DEV_ACCOUNTS[parsed.data.as];
    const accountId = await ensureDevAccount(deps.pool, who.displayName, who.roles);
    if (request.session !== null) await revokeSession(deps.pool, request.session.id);
    const { token } = await createSession(deps.pool, accountId, 'dev quick sign-in');
    setSessionCookie(reply, deps.cookie, token);
    return reply.status(200).send({ accountId, displayName: who.displayName });
  });
}
