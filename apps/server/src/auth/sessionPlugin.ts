/**
 * @file   apps/server/src/auth/sessionPlugin.ts
 * @module server/auth
 * @brief  Session cookie, request.session, CSRF check and the general API rate limit (03 §3, §8, §13).
 *
 * Responsibility: register @fastify/cookie; load the session named by the cookie into
 *                 `request.session` on every /api request; on state-changing ones require
 *                 `X-CSRF-Token` equal to the session's token (constant-time), except the
 *                 routes that start a session (register, login, guest, and the dev sign-in,
 *                 marked by its route config), which accept JSON only, and unmatched routes
 *                 (404); limit a session to 120 API calls a minute, requests without one to
 *                 600 per address. Cookie name, path and Secure flag follow 03 §3.
 * Depends on:     fastify, @fastify/cookie, ./sessions, ./rateLimit, ../db/pool
 * Used by:        ../http/app, ../http/routes/auth, ../http/routes/devSignIn
 * Spec:           docs/spec/03-security-architecture.md §3, §8, §13
 */
import { timingSafeEqual } from 'node:crypto';

import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbPool } from '../db/pool.js';
import { RATE_RULES, RateLimiter } from './rateLimit.js';
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

export interface CookieConfig {
  readonly name: string;
  readonly secure: boolean;
  readonly path: string;
}

// 03 §3: `__Host-` at the root of its own host; `__Secure-` with Path=<base path> under a
// path of a host site (the `__Host-` prefix requires Path=/); plain http in development.
export function cookieConfig(secure: boolean, basePath = '/'): CookieConfig {
  if (!secure) return { name: 'sbr_session', secure: false, path: '/' };
  if (basePath === '/') return { name: '__Host-sbr_session', secure: true, path: '/' };
  return { name: '__Secure-sbr_session', secure: true, path: basePath.replace(/\/$/, '') };
}

// Routes that start a session: no CSRF token exists yet (03 §8, SameSite=Lax + JSON only).
const SESSION_STARTERS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/guest',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function registerSessions(
  app: FastifyInstance,
  pool: DbPool,
  config: CookieConfig,
): Promise<void> {
  await app.register(cookie);
  app.decorateRequest('session', null);
  const apiLimit = new RateLimiter(RATE_RULES.api);
  const anonymousLimit = new RateLimiter(RATE_RULES.anonymous);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const token = request.cookies[config.name];
    request.session = token === undefined ? null : await findSession(pool, token);
    // A session is limited by its id, a request without one by its address (audit S3).
    const allowed =
      request.session === null
        ? anonymousLimit.take(request.ip).allowed
        : apiLimit.take(request.session.id).allowed;
    if (!allowed) return reply.status(429).send({ code: 'RATE_LIMITED' });
    return checkCsrf(request, reply);
  });
}

async function checkCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;
  // No route matched: no handler runs, the answer is 404.
  if (request.routeOptions.url === undefined) return;
  const path = request.url.split('?')[0] ?? '';
  if (request.routeOptions.config.noCsrf === true) return;
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

function startsSession(request: FastifyRequest, path: string): boolean {
  return SESSION_STARTERS.has(path) || request.routeOptions.config.sessionStarter === true;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function setSessionCookie(reply: FastifyReply, config: CookieConfig, token: string): void {
  void reply.setCookie(config.name, token, cookieOptions(config, 30 * 24 * 3600));
}

// Cleared with the same attributes it was set with (a `__Host-`/`__Secure-` cookie only
// goes away with Secure and its own path).
export function clearSessionCookie(reply: FastifyReply, config: CookieConfig): void {
  void reply.clearCookie(config.name, cookieOptions(config));
}

function cookieOptions(config: CookieConfig, maxAge?: number) {
  return {
    path: config.path,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.secure,
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}
