/**
 * @file   apps/server/src/http/routes/adminAccounts.ts
 * @module server/http
 * @brief  The admin area's Players and accounts (standalone only): find, roles, lock, 2FA, sessions.
 *
 * Responsibility: GET /api/v1/admin/accounts?q= (`accounts.manage`): up to 20 accounts by name
 *                 prefix q (owner: by e-mail too, `accounts.email`, 2026-11-21). POST …/:id/role
 *                 (the Admin role needs the owner's `admins.manage`), …/lock, …/end-sessions,
 *                 …/reset-2fa (owner's `twofactor.reset`). Every change: second step within 10
 *                 minutes (./adminTechnical recentSecondStep, admin-area §7 row 10), never the
 *                 caller's own account (409 OWN_ACCOUNT), never an owner's without being owner (403
 *                 FORBIDDEN), 404 for none; audited. Not registered in website mode: the website
 *                 decides accounts and roles (D41, D46).
 * Depends on:     fastify, zod, ../../admin/accounts, @seasonal/kit/server (SessionEnds, types),
 *                 ../../db/pool (types), ./adminTechnical (recentSecondStep), ./matches
 *                 (requirePermission)
 * Used by:        ../gameRoutes
 * Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §6, §7, §9 piece 8
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  endSessions,
  findAccounts,
  resetSecondStep,
  setLocked,
  setRole,
  type AccountChange,
} from '../../admin/accounts.js';
import type { SessionEnds } from '@seasonal/kit/server';
import type { DbPool } from '../../db/pool.js';
import { recentSecondStep } from './adminTechnical.js';
import { requirePermission } from './matches.js';

export interface AdminAccountsDeps {
  readonly pool: DbPool;
  readonly sessionEnds: SessionEnds;
}

const searchQuery = z.object({ q: z.string().trim().max(60).default('') });
const idParams = z.object({ id: z.uuid() });
const roleBody = z.strictObject({ role: z.enum(['organizer', 'game_admin']), on: z.boolean() });
const lockBody = z.strictObject({ locked: z.boolean() });
const emptyBody = z.strictObject({});

type WithId = FastifyRequest<{ Params: { id: string } }>;

// The checks every change shares (see the header); the change's facts, or null when refused.
async function allowed(
  request: WithId,
  reply: FastifyReply,
  deps: AdminAccountsDeps,
  permission: string,
): Promise<AccountChange | null> {
  const actor = requirePermission(request, reply, permission);
  if (actor === null || !recentSecondStep(request, reply)) return null;
  const params = idParams.safeParse(request.params);
  if (!params.success) {
    void reply.status(400).send({ code: 'VALIDATION_FAILED' });
    return null;
  }
  const accountId = params.data.id;
  const target = await deps.pool.query<{ owner: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM sbr.role_assignments ra
             WHERE ra.account_id = a.id AND ra.role_id = 'super_admin') AS owner
       FROM sbr.accounts a WHERE a.id = $1 AND a.status <> 'deleted'`,
    [accountId],
  );
  const row = target.rows[0];
  const refusal =
    row === undefined
      ? ([404, 'NOT_FOUND'] as const)
      : accountId === actor
        ? ([409, 'OWN_ACCOUNT'] as const)
        : row.owner && request.session?.permissions.includes('admins.manage') !== true
          ? ([403, 'FORBIDDEN'] as const)
          : null;
  if (refusal !== null) {
    void reply.status(refusal[0]).send({ code: refusal[1] });
    return null;
  }
  return { accountId, actorAccountId: actor, requestId: request.id };
}

// A change after its checks and its body; its ended sessions lose their sockets.
function change<B>(
  app: FastifyInstance,
  deps: AdminAccountsDeps,
  route: { path: string; schema: z.ZodType<B>; permission: (body: B) => string },
  run: (c: AccountChange, body: B) => Promise<readonly string[]>,
): void {
  app.post<{ Params: { id: string } }>(route.path, async (request, reply) => {
    const body = route.schema.safeParse(request.body);
    const permission = body.success ? route.permission(body.data) : 'accounts.manage';
    const c = await allowed(request, reply, deps, permission);
    if (c === null) return reply;
    if (!body.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    await deps.sessionEnds.end([...(await run(c, body.data))]);
    return reply.status(204).send();
  });
}

export function registerAdminAccounts(app: FastifyInstance, deps: AdminAccountsDeps): void {
  app.get('/api/v1/admin/accounts', async (request, reply) => {
    if (requirePermission(request, reply, 'accounts.manage') === null) return reply;
    const query = searchQuery.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const withEmail = request.session?.permissions.includes('accounts.email') === true;
    return { accounts: await findAccounts(deps.pool, query.data.q, withEmail) };
  });
  const manage = () => 'accounts.manage';
  change(
    app,
    deps,
    {
      path: '/api/v1/admin/accounts/:id/role',
      schema: roleBody,
      // Making or unmaking an Admin is the owner's (admin-area §2).
      permission: (b) => (b.role === 'game_admin' ? 'admins.manage' : 'accounts.manage'),
    },
    (c, b) => setRole(deps.pool, { ...c, role: b.role, on: b.on }),
  );
  change(
    app,
    deps,
    { path: '/api/v1/admin/accounts/:id/lock', schema: lockBody, permission: manage },
    (c, b) => setLocked(deps.pool, { ...c, locked: b.locked }),
  );
  change(
    app,
    deps,
    // The owner's only (2026-11-21).
    {
      path: '/api/v1/admin/accounts/:id/reset-2fa',
      schema: emptyBody,
      permission: () => 'twofactor.reset',
    },
    (c) => resetSecondStep(deps.pool, c),
  );
  change(
    app,
    deps,
    { path: '/api/v1/admin/accounts/:id/end-sessions', schema: emptyBody, permission: manage },
    (c) => endSessions(deps.pool, c),
  );
}
