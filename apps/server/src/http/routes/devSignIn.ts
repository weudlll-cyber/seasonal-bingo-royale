/**
 * @file   apps/server/src/http/routes/devSignIn.ts
 * @module server/http
 * @brief  Development-only quick sign-in: host, admin and three players without a password.
 *
 * Responsibility: POST /api/v1/dev/sign-in { as: 'host' | 'admin' | 'player-1' | 'player-2' |
 *                 'player-3' } creates on first use, or reuses, `dev-host` (organizer), `dev-admin`
 *                 (game_admin) or `dev-player-N` and starts a session for it (./auth openSession,
 *                 the old session ended), so the owner can try host and players alone in several
 *                 browser windows. The load check signs in `load-001` … `load-200` the same way
 *                 (`dev-load-NNN`, players) and removes them with DELETE /api/v1/dev/load-accounts.
 *                 Checked by the kit's devSignInAccount (own keys only, the whole load name).
 *                 Registered only with SBR_DEV=1; a test proves a production build answers 404.
 * Depends on:     fastify, @seasonal/kit/devtools, @seasonal/kit/server (types), ../../auth/*,
 *                 ../../db/pool, ./auth (openSession)
 * Used by:        ../app
 * Spec:           docs/spec/15-implementation-plan.md WP-09 (draft), docs/spec/12-testing-strategy.md §8;
 *                 docs/concepts/kit-adoption.md §2 (B6)
 */
import { devSignInAccount } from '@seasonal/kit/devtools';
import type { SessionEnds } from '@seasonal/kit/server';
import type { FastifyInstance } from 'fastify';

import { deleteAccount, ensureDevAccount } from '../../auth/accounts.js';
import type { CookieConfig } from '../../auth/sessionPlugin.js';
import { accountSessionIds } from '../../auth/sessions.js';
import type { DbPool } from '../../db/pool.js';
import { openSession } from './auth.js';

const DEV_ACCOUNTS = {
  host: { displayName: 'dev-host', roles: ['organizer'] },
  // The admin area's Admin (game_admin, admin-area §2.2); the sign-in marks its second step.
  admin: { displayName: 'dev-admin', roles: ['game_admin'] },
  // The owner (super_admin): the Technical section (admin-area §9 piece 7).
  owner: { displayName: 'dev-owner', roles: ['super_admin'] },
  'player-1': { displayName: 'dev-player-1', roles: [] },
  'player-2': { displayName: 'dev-player-2', roles: [] },
  'player-3': { displayName: 'dev-player-3', roles: [] },
};

// The development accounts, and the load check's numbered players: `load-001` … `load-200`.
const RULES = { accounts: DEV_ACCOUNTS, load: /^load-\d{3}$/ };

export function registerDevSignIn(
  app: FastifyInstance,
  deps: { readonly pool: DbPool; readonly cookie: CookieConfig; readonly sessionEnds: SessionEnds },
): void {
  // Starts a session: no CSRF token yet (../../auth/sessionPlugin).
  app.post('/api/v1/dev/sign-in', { config: { sessionStarter: true } }, async (request, reply) => {
    const who = devSignInAccount(request.body, RULES);
    if (who === null) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const accountId = await ensureDevAccount(deps.pool, who.displayName, who.roles);
    await openSession(request, reply, deps, accountId);
    // Nobody knows a development account's password or TOTP: its admin sessions count the
    // second step (D60) as done, so `dev-admin` and `dev-owner` can try the admin area locally.
    if (who.roles.includes('game_admin') || who.roles.includes('super_admin')) {
      await deps.pool.query(
        'UPDATE sbr.sessions SET last_2fa_at = now() WHERE account_id = $1 AND last_2fa_at IS NULL',
        [accountId],
      );
    }
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
      await deps.sessionEnds.end(sessions);
    }
    return reply.status(200).send({ deleted: rows.rows.length });
  });
}
