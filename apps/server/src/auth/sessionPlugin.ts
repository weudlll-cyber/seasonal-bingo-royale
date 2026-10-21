/**
 * @file   apps/server/src/auth/sessionPlugin.ts
 * @module server/auth
 * @brief  Session cookie, request.session, CSRF check and the general API rate limit (03 §3, §8, §13).
 *
 * Responsibility: register @fastify/cookie; on every /api request load the session named
 *                 by the cookie into `request.session` (null when absent or dead); on
 *                 state-changing /api requests require the `X-CSRF-Token` header to equal
 *                 the session's token (constant-time), except the routes that create the
 *                 first session (register, login, guest, dev sign-in), which accept only
 *                 JSON bodies so a cross-site form cannot reach them; limit every session
 *                 to 120 API calls a minute. Cookie name and Secure flag follow 03 §3; on
 *                 plain-http development the `__Host-` prefix cannot be used.
 * Depends on:     fastify, @fastify/cookie, node:crypto, ./sessions, ./rateLimit, ../db/pool
 * Used by:        ../http/app
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
}

export interface CookieConfig {
  readonly name: string;
  readonly secure: boolean;
}

export function cookieConfig(production: boolean): CookieConfig {
  return production
    ? { name: '__Host-sbr_session', secure: true }
    : { name: 'sbr_session', secure: false };
}

// Routes that start a session: no CSRF token exists yet (03 §8, SameSite=Lax + JSON only).
const SESSION_STARTERS = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/guest',
  '/api/v1/dev/sign-in',
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
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const token = request.cookies[config.name];
    request.session = token === undefined ? null : await findSession(pool, token);
    if (request.session !== null && !apiLimit.take(request.session.id).allowed) {
      return reply.status(429).send({ code: 'RATE_LIMITED' });
    }
    return checkCsrf(request, reply);
  });
}

async function checkCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;
  const path = request.url.split('?')[0] ?? '';
  if (SESSION_STARTERS.has(path)) {
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

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function setSessionCookie(reply: FastifyReply, config: CookieConfig, token: string): void {
  void reply.setCookie(config.name, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secure,
    maxAge: 30 * 24 * 3600,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: CookieConfig): void {
  void reply.clearCookie(config.name, { path: '/' });
}
