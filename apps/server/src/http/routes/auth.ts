/**
 * @file   apps/server/src/http/routes/auth.ts
 * @module server/http
 * @brief  Session and local-account routes under /api/v1 (05 §2.1, WP-09).
 *
 * Responsibility: GET /session (account summary, permissions, CSRF token, feature flags),
 *                 POST /auth/register, /auth/login, /auth/logout, /auth/guest, and DELETE /me
 *                 (the account, after its password is checked). Login answers
 *                 uniformly and verifies a dummy hash for unknown e-mails, so timing and
 *                 text never reveal whether an account exists (03 §2.1). Login and
 *                 registration are rate-limited per IP and per account+IP (03 §13). E-mail
 *                 verification and 2FA are behind feature flags that are off by default;
 *                 when verification is on, unverified accounts cannot sign in.
 * Depends on:     fastify, zod, ../../auth/*, ../../db/pool, ../../config/features
 * Used by:        ../app
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §2.1, §2.3, §3, §13
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  deleteAccount,
  findLoginAccount,
  passwordHashOf,
  recordLogin,
  registerAccount,
} from '../../auth/accounts.js';
import { dummyPasswordHash, passwordProblem, verifyPassword } from '../../auth/password.js';
import { RATE_RULES, RateLimiter } from '../../auth/rateLimit.js';
import {
  clearSessionCookie,
  setSessionCookie,
  type CookieConfig,
} from '../../auth/sessionPlugin.js';
import type { SessionEnds } from '../../auth/sessionEnds.js';
import { accountSessionIds, createSession, revokeSession } from '../../auth/sessions.js';
import type { Features } from '../../config/features.js';
import type { DbPool } from '../../db/pool.js';

export interface AuthDeps {
  readonly pool: DbPool;
  readonly cookie: CookieConfig;
  readonly features: Features;
  // Ended sessions: the gateway closes their sockets (audit S4).
  readonly sessionEnds: SessionEnds;
}

const registerBody = z.object({
  email: z.email().max(254),
  displayName: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}_.-]{3,24}$/u),
  password: z.string(),
});
const loginBody = z.object({ email: z.email().max(254), password: z.string().max(128) });

const LOGIN_FAILED = { code: 'LOGIN_FAILED', message: 'Invalid e-mail or password.' };

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const limits = {
    register: new RateLimiter(RATE_RULES.register),
    loginIp: new RateLimiter(RATE_RULES.loginIp),
    loginAccountIp: new RateLimiter(RATE_RULES.loginAccountIp),
    guest: new RateLimiter(RATE_RULES.guest),
  };
  app.get('/api/v1/session', (request) => sessionSummary(request, deps.features));
  app.post('/api/v1/auth/register', async (request, reply) => {
    if (!limits.register.take(request.ip).allowed) return tooMany(reply);
    return register(request, reply, deps);
  });
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(LOGIN_FAILED);
    const key = `${parsed.data.email.toLowerCase()}|${request.ip}`;
    if (!limits.loginIp.take(request.ip).allowed || !limits.loginAccountIp.take(key).allowed) {
      return tooMany(reply);
    }
    return login(request, reply, deps, parsed.data);
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.session !== null) {
      await revokeSession(deps.pool, request.session.id);
      deps.sessionEnds.end([request.session.id]);
    }
    clearSessionCookie(reply, deps.cookie);
    return reply.status(204).send();
  });
  app.delete('/api/v1/me', async (request, reply) => deleteMe(request, reply, deps));
  app.post('/api/v1/auth/guest', async (request, reply) => {
    if (!deps.features.guests) return reply.status(404).send({ code: 'NOT_FOUND' });
    if (!limits.guest.take(request.ip).allowed) return tooMany(reply);
    const { token } = await createSession(deps.pool, null, request.headers['user-agent'] ?? null);
    setSessionCookie(reply, deps.cookie, token);
    return reply.status(201).send({ kind: 'guest' });
  });
}

function sessionSummary(request: FastifyRequest, features: Features) {
  const s = request.session;
  return {
    signedIn: s !== null && s.accountId !== null,
    kind: s?.kind ?? null,
    account: s?.accountId ? { id: s.accountId, displayName: s.displayName } : null,
    permissions: s?.permissions ?? [],
    csrfToken: s?.csrfToken ?? null,
    features,
  };
}

async function register(request: FastifyRequest, reply: FastifyReply, deps: AuthDeps) {
  const parsed = registerBody.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
  const problem = passwordProblem(parsed.data.password);
  if (problem !== null) return reply.status(400).send({ code: 'PASSWORD_WEAK', reason: problem });
  const created = await registerAccount(deps.pool, parsed.data);
  // One answer for an e-mail or name already in use, so the e-mail is never revealed.
  if (!created.ok) return reply.status(409).send({ code: 'REGISTRATION_FAILED' });
  return startSession(request, reply, deps, { accountId: created.id, status: 201 });
}

async function login(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AuthDeps,
  body: z.infer<typeof loginBody>,
) {
  const account = await findLoginAccount(deps.pool, body.email);
  const encoded = account?.passwordHash ?? (await dummyPasswordHash());
  const valid = await verifyPassword(encoded, body.password);
  if (account === null || !valid) return reply.status(401).send(LOGIN_FAILED);
  if (deps.features.emailVerification && !account.emailVerified) {
    return reply.status(403).send({ code: 'EMAIL_NOT_VERIFIED' });
  }
  await recordLogin(deps.pool, account.id);
  return startSession(request, reply, deps, { accountId: account.id, status: 200 });
}

async function startSession(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: AuthDeps,
  { accountId, status }: { readonly accountId: string; readonly status: number },
) {
  // A fresh session id on every sign-in (03 §3: rotate on login).
  if (request.session !== null) {
    await revokeSession(deps.pool, request.session.id);
    deps.sessionEnds.end([request.session.id]);
  }
  const { token } = await createSession(
    deps.pool,
    accountId,
    request.headers['user-agent'] ?? null,
  );
  setSessionCookie(reply, deps.cookie, token);
  return reply.status(status).send({ accountId });
}

// DELETE /me { password } (05 §2.2): the account is deleted after its password is checked.
const deleteBody = z.object({ password: z.string().max(128) });

async function deleteMe(request: FastifyRequest, reply: FastifyReply, deps: AuthDeps) {
  const accountId = request.session?.accountId ?? null;
  if (accountId === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
  const parsed = deleteBody.safeParse(request.body);
  const encoded = await passwordHashOf(deps.pool, accountId);
  const valid =
    parsed.success && encoded !== null && (await verifyPassword(encoded, parsed.data.password));
  if (!valid) return reply.status(403).send({ code: 'PASSWORD_REQUIRED' });
  const sessions = await accountSessionIds(deps.pool, accountId);
  await deleteAccount(deps.pool, accountId);
  deps.sessionEnds.end(sessions);
  clearSessionCookie(reply, deps.cookie);
  return reply.status(204).send();
}

function tooMany(reply: FastifyReply) {
  return reply.status(429).send({ code: 'RATE_LIMITED' });
}
