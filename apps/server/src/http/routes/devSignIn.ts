/**
 * @file   apps/server/src/http/routes/devSignIn.ts
 * @module server/http
 * @brief  Development-only quick sign-in: host and three players without a password.
 *
 * Responsibility: POST /api/v1/dev/sign-in { as: 'host' | 'player-1' | 'player-2' |
 *                 'player-3' } creates on first use, or reuses, the account `dev-host`
 *                 (role organizer) or `dev-player-N` and starts a session for it, so the
 *                 owner can try host and players alone in several browser windows. The load
 *                 check signs in `load-001` … `load-200` the same way (`dev-load-NNN`, players)
 *                 and removes them with DELETE /api/v1/dev/load-accounts. The app
 *                 registers this route only with SBR_DEV=1; a test proves
 *                 a production build answers 404.
 * Depends on:     fastify, zod, ../../auth/*, ../../db/pool
 * Used by:        ../app
 * Spec:           docs/spec/15-implementation-plan.md WP-09 (draft), docs/spec/12-testing-strategy.md §8
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { deleteAccount, ensureDevAccount } from '../../auth/accounts.js';
import { setSessionCookie, type CookieConfig } from '../../auth/sessionPlugin.js';
import type { SessionEnds } from '../../auth/sessionEnds.js';
import { accountSessionIds, createSession, revokeSession } from '../../auth/sessions.js';
import type { DbPool } from '../../db/pool.js';

const DEV_ACCOUNTS = {
  host: { displayName: 'dev-host', roles: ['organizer'] },
  'player-1': { displayName: 'dev-player-1', roles: [] },
  'player-2': { displayName: 'dev-player-2', roles: [] },
  'player-3': { displayName: 'dev-player-3', roles: [] },
} as const;

// The load check (load/) signs in numbered players: `load-001` … `load-200`.
const LOAD = /^load-\d{3}$/;
const body = z.object({
  as: z.union([z.enum(['host', 'player-1', 'player-2', 'player-3']), z.string().regex(LOAD)]),
});

function devAccount(as: string): {
  readonly displayName: string;
  readonly roles: readonly string[];
} {
  return as in DEV_ACCOUNTS
    ? DEV_ACCOUNTS[as as keyof typeof DEV_ACCOUNTS]
    : { displayName: `dev-${as}`, roles: [] };
}

export function registerDevSignIn(
  app: FastifyInstance,
  deps: { readonly pool: DbPool; readonly cookie: CookieConfig; readonly sessionEnds: SessionEnds },
): void {
  // Starts a session: no CSRF token yet (../../auth/sessionPlugin).
  app.post('/api/v1/dev/sign-in', { config: { sessionStarter: true } }, async (request, reply) => {
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const who = devAccount(parsed.data.as);
    const accountId = await ensureDevAccount(deps.pool, who.displayName, who.roles);
    if (request.session !== null) {
      await revokeSession(deps.pool, request.session.id);
      deps.sessionEnds.end([request.session.id]);
    }
    const { token } = await createSession(deps.pool, accountId, 'dev quick sign-in');
    setSessionCookie(reply, deps.cookie, token);
    return reply.status(200).send({ accountId, displayName: who.displayName });
  });
  // The load check removes its accounts afterwards (their sessions and roles go with them).
  // Outside any session, so without a CSRF token (../../auth/sessionPlugin); a few calls a
  // minute are plenty for one load run.
  const config = { noCsrf: true, rateLimit: { max: 5, timeWindow: 60_000 } };
  app.delete('/api/v1/dev/load-accounts', { config }, async (_request, reply) => {
    const rows = await deps.pool.query<{ id: string }>(
      `SELECT id FROM sbr.accounts WHERE display_name LIKE 'dev-load-%'`,
    );
    for (const { id } of rows.rows) {
      const sessions = await accountSessionIds(deps.pool, id);
      await deleteAccount(deps.pool, id);
      deps.sessionEnds.end(sessions);
    }
    return reply.status(200).send({ deleted: rows.rows.length });
  });
}
