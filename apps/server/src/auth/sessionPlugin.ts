/**
 * @file   apps/server/src/auth/sessionPlugin.ts
 * @module server/auth
 * @brief  request.session, the CSRF checks and the general API rate limit (03 §3, §8, §13).
 *
 * Responsibility: register @fastify/cookie; load the session named by the cookie into
 *                 `request.session` on every /api request; on state-changing ones require that
 *                 the browser names this site as their origin (the kit's `writeCheck`) and
 *                 `X-CSRF-Token` equal to the session's token (constant-time), except the
 *                 routes that start a session (register, login, guest, and the dev sign-in,
 *                 marked by its route config), which accept JSON only, and unmatched routes
 *                 (404); limit a session to 120 API calls a minute, requests without one to
 *                 600 per address. The cookie's name, path and flags are the kit's
 *                 `sessionCookie` of `SESSION_COOKIE` (03 §3); it lasts as long as a player's or
 *                 guest's session of the running mode (`sessionCookieOptions`, at each call).
 * Depends on:     fastify, @fastify/cookie, @seasonal/kit/server (RateLimiter, writeCheck), ./sessions,
 *                 ./rateLimit, ../db/pool
 * Used by:        ../http/app, ../http/routes/auth, ../http/routes/devSignIn,
 *                 ../http/routes/websiteSignIn
 * Spec:           docs/spec/03-security-architecture.md §3, §8, §13
 */
import { timingSafeEqual } from 'node:crypto';

import cookie from '@fastify/cookie';
import { RateLimiter, writeCheck, type SessionCookie } from '@seasonal/kit/server';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { liveLimits, sessionLengthsOf, type LiveTechnical } from '../config/technical.js';
import type { DbPool } from '../db/pool.js';
import { liveRule, RATE_RULES } from './rateLimit.js';
import { findSession, type Session } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
  }
  interface FastifyContextConfig {
    // The route starts a session, like the ones in SESSION_STARTERS (the development quick
    // sign-in marks itself, so its path stays out of the production bundle).
    sessionStarter?: boolean;
    // A development route outside any session (the load check's clean-up): no CSRF token.
    noCsrf?: boolean;
  }
}

// The session cookie's name before the kit's prefix: the kit's `sessionCookie` adds `__Host-` at
// the root of its own host and `__Secure-` with Path=<base path> under a path of a host site (the
// `__Host-` prefix requires Path=/), nothing in plain-http development (03 §3).
export const SESSION_COOKIE = 'sbr_session';

// Routes that start a session: no CSRF token exists yet (03 §8, SameSite=Lax + JSON only).
const SESSION_STARTERS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/guest',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface SessionOptions {
  // The Technical section's session lengths and API limit, read on every request.
  readonly technical?: LiveTechnical | undefined;
  // The proxies whose X-Forwarded-Host the write check believes (SBR_TRUSTED_PROXIES).
  readonly trustedProxies?: readonly string[];
}

// `technical`: the Technical section's session lengths and API limit, read on every request
// (admin-area §9 piece 7); today's values without it. Every write is checked by the kit's
// `writeCheck` (Sec-Fetch-Site and Origin against this host) before the token.
export async function registerSessions(
  app: FastifyInstance,
  pool: DbPool,
  config: SessionCookie,
  { technical, trustedProxies = [] }: SessionOptions = {},
): Promise<void> {
  await app.register(cookie);
  app.decorateRequest('session', null);
  const apiLimit = new RateLimiter(
    liveRule('api', technical === undefined ? undefined : liveLimits(technical)),
  );
  const anonymousLimit = new RateLimiter(RATE_RULES.anonymous);
  // Where the browser says a write came from; the token below is the second layer (kit K60).
  const fromThisSite = writeCheck({ trustedProxies });
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const token = request.cookies[config.name];
    const lengths = technical === undefined ? undefined : sessionLengthsOf(technical());
    request.session = token === undefined ? null : await findSession(pool, token, lengths);
    // A session is limited by its id, a request without one by its address (audit S3).
    const allowed =
      request.session === null
        ? anonymousLimit.take(request.ip).allowed
        : apiLimit.take(request.session.id).allowed;
    if (!allowed) return reply.status(429).send({ code: 'RATE_LIMITED' });
    return checkCsrf(request, reply, fromThisSite);
  });
}

async function checkCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
  fromThisSite: ReturnType<typeof writeCheck>,
): Promise<void> {
  if (needsNoCheck(request)) return;
  const path = request.url.split('?')[0] ?? '';
  if (await foreignWrite(request, reply, fromThisSite)) return;
  if (startsSession(request, path)) {
    if (!(request.headers['content-type'] ?? '').startsWith('application/json')) {
      await reply.status(415).send({ code: 'JSON_REQUIRED' });
    }
    return;
  }
  const sent = request.headers['x-csrf-token'];
  const expected = request.session?.csrfToken;
  if (typeof sent !== 'string' || expected === undefined || !sameToken(sent, expected)) {
    await reply.status(403).send({ code: 'CSRF_INVALID' });
  }
}

// A read; or no route matched (no handler runs, the answer is 404); or a development route
// outside any session.
function needsNoCheck(request: FastifyRequest): boolean {
  const { url, config } = request.routeOptions;
  return SAFE_METHODS.has(request.method) || url === undefined || config.noCsrf === true;
}

// A write the browser does not name as this site's own is refused (403), session or not.
async function foreignWrite(
  request: FastifyRequest,
  reply: FastifyReply,
  fromThisSite: ReturnType<typeof writeCheck>,
): Promise<boolean> {
  const decision = fromThisSite({
    method: request.method,
    headers: request.headers,
    peer: request.socket.remoteAddress,
  });
  if (decision.ok) return false;
  request.log.warn({ why: decision.reason }, 'write refused: not from this site');
  await reply.status(403).send({ code: 'CSRF_INVALID' });
  return true;
}

function startsSession(request: FastifyRequest, path: string): boolean {
  return SESSION_STARTERS.has(path) || request.routeOptions.config.sessionStarter === true;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
