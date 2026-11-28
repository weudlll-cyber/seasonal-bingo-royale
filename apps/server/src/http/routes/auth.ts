/**
 * @file   apps/server/src/http/routes/auth.ts
 * @module server/http
 * @brief  Session and local-account routes under /api/v1 (05 §2.1, WP-09).
 *
 * Responsibility: GET /session (account, permissions, CSRF token, flags, limits, sign-in mode;
 *                 website mode: the website's chat room, 07 §6, and the member's own Discord
 *                 steps for the header), POST /auth/register and
 *                 /auth/login (local mode only; in website mode players sign in through the
 *                 website, D37), /auth/logout, /auth/guest, DELETE /me (password checked first;
 *                 website mode: display name typed, D42). Login answers uniformly and verifies a
 *                 dummy hash for unknown e-mails, so nothing reveals whether an account exists (03
 *                 §2.1). Registration is rate-limited per IP; login is braked per IP and per
 *                 account+IP by wrong passwords only (K46; 03 §13).
 *                 E-mail verification and 2FA: feature flags, off by default.
 * Depends on:     fastify, zod, @sbr/contracts (LIMITS), @seasonal/kit/server (RateLimiter,
 *                 types), ../../auth/* (rateLimit: behindBrakes), ../../db/pool, ../../config/features,
 *                 ../sessionStart
 * Used by:        ../app
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §2.1, §2.3, §3, §13
 */
import { LIMITS, type ClientScreens } from '@sbr/contracts';
import {
  FailureBrake,
  RateLimiter,
  type SessionCookie,
  type SessionEnds,
} from '@seasonal/kit/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  deleteAccount,
  findLoginAccount,
  passwordHashOf,
  recordLogin,
  registerAccount,
} from '../../auth/accounts.js';
import { DISPLAY_NAME } from '../../auth/displayName.js';
import { dummyPasswordHash, passwordProblem, verifyPassword } from '../../auth/password.js';
import { behindBrakes, liveRule } from '../../auth/rateLimit.js';
import {
  accountSessionIds,
  createSession,
  revokeSession,
  WEBSITE_SESSION_DAYS,
} from '../../auth/sessions.js';
import { twoFactorStep } from '../../auth/twoFactor.js';
import type { Features } from '../../config/features.js';
import { liveLimits, sessionLengthsOf, type LiveTechnical } from '../../config/technical.js';
import type { DbPool } from '../../db/pool.js';
import { endCookie, giveCookie, openSession } from '../sessionStart.js';

interface AuthDeps {
  readonly pool: DbPool;
  readonly cookie: SessionCookie;
  // The switches as they are now (../../config/features liveFeatures).
  readonly features: () => Features;
  // The screen values the client reads at page load (admin-area §8 (i)), as they are now.
  readonly screens: () => ClientScreens;
  // The Technical settings as they are now: rate limits, session lengths (admin-area §9 piece 7).
  readonly technical: LiveTechnical;
  // Ended sessions: the gateway closes their sockets (audit S4).
  readonly sessionEnds: SessionEnds;
  // The live views name a deleted account as such at once (../../view/liveViews, audit S10).
  readonly accountDeleted?: (accountId: string) => void;
  // D37: in website mode players sign in only through the website (./websiteSignIn at
  // `${basePath}auth/website`); registration and password sign-in are not there.
  readonly mode: 'local' | 'website';
  readonly basePath: string;
  // Website mode: the website's chat room and its embed page on the same site (07 §6).
  readonly chat?: { readonly path: string; readonly room: string } | undefined;
}

const registerBody = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().regex(DISPLAY_NAME),
  password: z.string(),
});
const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().max(LIMITS.password.max),
});

const LOGIN_FAILED = { code: 'LOGIN_FAILED', message: 'Invalid e-mail or password.' };

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const live = liveLimits(deps.technical);
  const limits = {
    register: new RateLimiter(liveRule('register', live)),
    loginIp: new FailureBrake(liveRule('loginIp', live)),
    loginAccountIp: new FailureBrake(liveRule('loginAccountIp', live)),
    guest: new RateLimiter(liveRule('guest', live)),
  };
  app.get('/api/v1/session', (request) => sessionSummary(request, deps));
  if (deps.mode === 'local') registerLocalSignIn(app, deps, limits);
  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.session !== null) {
      await revokeSession(deps.pool, request.session.id);
      await deps.sessionEnds.end([request.session.id]);
    }
    endCookie(reply, deps.cookie);
    return reply.status(204).send();
  });
  app.delete('/api/v1/me', async (request, reply) => deleteMe(request, reply, deps));
  app.post('/api/v1/auth/guest', async (request, reply) => {
    if (!deps.features().guests) return reply.status(404).send({ code: 'NOT_FOUND' });
    if (!limits.guest.take(request.ip).allowed) return tooMany(reply);
    // Website mode: as long as a member's session from the website sign-in (the same lengths in
    // every game, 2026-11-09); standalone the player default.
    const days = deps.mode === 'website' ? WEBSITE_SESSION_DAYS : undefined;
    const lengths = sessionLengthsOf(deps.technical(), days);
    const { token } = await createSession(
      deps.pool,
      null,
      request.headers['user-agent'] ?? null,
      lengths,
    );
    giveCookie(reply, deps.cookie, token, lengths);
    return reply.status(201).send({ kind: 'guest' });
  });
}

// Registration and password sign-in: local mode only (D37).
function registerLocalSignIn(
  app: FastifyInstance,
  deps: AuthDeps,
  limits: {
    readonly register: RateLimiter;
    readonly loginIp: FailureBrake;
    readonly loginAccountIp: FailureBrake;
  },
): void {
  app.post('/api/v1/auth/register', async (request, reply) => {
    if (!limits.register.take(request.ip).allowed) return tooMany(reply);
    return register(request, reply, deps);
  });
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(LOGIN_FAILED);
    // The address, and the account at that address: each braked by wrong passwords only (K46).
    const keys = [
      [limits.loginIp, request.ip],
      [limits.loginAccountIp, `${parsed.data.email.toLowerCase()}|${request.ip}`],
    ] as const;
    const ran = await behindBrakes(keys, (judged) =>
      login(request, reply, deps, { ...parsed.data, judged }),
    );
    return ran ? reply : tooMany(reply);
  });
}

// A local admin's second sign-in step still to do (D60): 'enrol' or 'code', else null.
async function pendingStep(request: FastifyRequest, deps: AuthDeps) {
  const s = request.session;
  if (s === null || s.accountId === null || !s.twoFactorPending) return null;
  return twoFactorStep(deps.pool, s.accountId);
}

async function sessionSummary(request: FastifyRequest, deps: AuthDeps) {
  const s = request.session;
  return {
    twoFactor: await pendingStep(request, deps),
    signedIn: s !== null && s.accountId !== null,
    kind: s?.kind ?? null,
    account: await accountOf(s, deps),
    permissions: s?.permissions ?? [],
    csrfToken: s?.csrfToken ?? null,
    // The server's clock, for the client's countdowns (kit K69).
    serverTime: Date.now(),
    features: deps.features(),
    // The limits the server checks forms with; the client keeps no copy (admin-area §8 (m)).
    limits: LIMITS,
    // What players see that is not a rule (admin-area §8 (i)): applied at the next page load.
    screens: deps.screens(),
    authMode: deps.mode,
    ...websiteParts(deps),
  };
}

// The signed-in account; website mode adds the member's own Discord steps as the website last
// sent them (the header's badges, kit K56).
async function accountOf(s: FastifyRequest['session'], deps: AuthDeps) {
  if (s === null || s.accountId === null) return null;
  const account = { id: s.accountId, displayName: s.displayName };
  if (deps.mode !== 'website') return account;
  const r = await deps.pool.query<{ steps: unknown }>(
    'SELECT steps FROM sbr.accounts WHERE id = $1',
    [s.accountId],
  );
  return { ...account, steps: r.rows[0]?.steps ?? [] };
}

// Website mode: the sign-in button's target (D37) and the website's chat room (07 §6).
function websiteParts(deps: AuthDeps) {
  if (deps.mode !== 'website') return {};
  return {
    signInPath: `${deps.basePath}auth/website`,
    ...(deps.chat === undefined ? {} : { chat: deps.chat }),
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
  body: z.infer<typeof loginBody> & { readonly judged: (wrong: boolean) => void },
) {
  const account = await findLoginAccount(deps.pool, body.email);
  const encoded = account?.passwordHash ?? (await dummyPasswordHash());
  const valid = await verifyPassword(encoded, body.password);
  body.judged(account === null || !valid);
  if (account === null || !valid) return reply.status(401).send(LOGIN_FAILED);
  if (deps.features().emailVerification && !account.emailVerified) {
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
  await openSession(request, reply, deps, accountId);
  return reply.status(status).send({ accountId });
}

// DELETE /me (05 §2.2): local mode { password }, the account's password checked; website mode
// { displayName }, the display name typed exactly, as website accounts have no password (D42).
const deleteBody = z.object({ password: z.string().max(128) });
const deleteByName = z.object({ displayName: z.string().max(64) });

async function deleteConfirmed(request: FastifyRequest, deps: AuthDeps, accountId: string) {
  if (deps.mode === 'website') {
    const parsed = deleteByName.safeParse(request.body);
    return parsed.success && parsed.data.displayName === request.session?.displayName;
  }
  const parsed = deleteBody.safeParse(request.body);
  const encoded = await passwordHashOf(deps.pool, accountId);
  return (
    parsed.success && encoded !== null && (await verifyPassword(encoded, parsed.data.password))
  );
}

async function deleteMe(request: FastifyRequest, reply: FastifyReply, deps: AuthDeps) {
  const accountId = request.session?.accountId ?? null;
  if (accountId === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
  if (!(await deleteConfirmed(request, deps, accountId))) {
    const code = deps.mode === 'website' ? 'NAME_REQUIRED' : 'PASSWORD_REQUIRED';
    return reply.status(403).send({ code });
  }
  const sessions = await accountSessionIds(deps.pool, accountId);
  await deleteAccount(deps.pool, accountId);
  deps.accountDeleted?.(accountId);
  await deps.sessionEnds.end(sessions);
  endCookie(reply, deps.cookie);
  return reply.status(204).send();
}

function tooMany(reply: FastifyReply) {
  return reply.status(429).send({ code: 'RATE_LIMITED' });
}
