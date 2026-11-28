/**
 * @file   apps/server/src/http/sessionStart.ts
 * @module server/http
 * @brief  A new session and its cookie: opened on a sign-in, ended on a sign-out (03 §3).
 *
 * Responsibility: `openSession` ends the request's old session and creates a fresh one for an
 *                 account (rotate on login), with its cookie; `giveCookie` and `endCookie` set
 *                 and clear the cookie with the kit's `sessionCookieOptions`, its Max-Age the
 *                 session's own absolute length.
 * Depends on:     fastify, @sbr/contracts (TECHNICAL_DEFAULTS), @seasonal/kit/server
 *                 (sessionCookieOptions, types), ../auth/sessions, ../config/technical, ../db/pool
 * Used by:        ./routes/auth, ./routes/websiteSignIn, ./routes/devSignIn
 * Spec:           docs/spec/03-security-architecture.md §3
 */
import { TECHNICAL_DEFAULTS } from '@sbr/contracts';
import { sessionCookieOptions, type SessionCookie, type SessionEnds } from '@seasonal/kit/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { createSession, revokeSession, type SessionLengths } from '../auth/sessions.js';
import { sessionLengthsOf, type LiveTechnical } from '../config/technical.js';
import type { DbPool } from '../db/pool.js';

// A fresh session for the account, the old one ended (03 §3: rotate on login); also the
// website sign-in's (./websiteSignIn) and the dev quick sign-in's (./devSignIn).
export async function openSession(
  request: FastifyRequest,
  reply: FastifyReply,
  // playerDays: a member's or guest's absolute lifetime in website mode (7 days); else the
  // Technical section's (30 unless changed).
  deps: {
    readonly pool: DbPool;
    readonly cookie: SessionCookie;
    readonly sessionEnds: SessionEnds;
    readonly playerDays?: number;
    readonly technical?: LiveTechnical;
  },
  accountId: string,
): Promise<void> {
  if (request.session !== null) {
    await revokeSession(deps.pool, request.session.id);
    await deps.sessionEnds.end([request.session.id]);
  }
  const lengths = sessionLengthsOf(deps.technical?.() ?? TECHNICAL_DEFAULTS, deps.playerDays);
  const { token } = await createSession(
    deps.pool,
    accountId,
    request.headers['user-agent'] ?? null,
    lengths,
  );
  giveCookie(reply, deps.cookie, token, lengths);
}

// The cookie lasts as long as the session it names can: the player's and guest's absolute
// lifetime of the running mode (30 days standalone unless the Technical section says otherwise,
// 7 in website mode), so the browser never keeps a cookie the server has already ended.
export function giveCookie(
  reply: FastifyReply,
  cookie: SessionCookie,
  token: string,
  lengths: SessionLengths,
): void {
  const options = sessionCookieOptions(cookie, lengths.playerAbsoluteDays);
  void reply.setCookie(cookie.name, token, options);
}

// Cleared with the same attributes it was set with (a `__Host-`/`__Secure-` cookie only goes
// away with Secure and its own path).
export function endCookie(reply: FastifyReply, cookie: SessionCookie): void {
  void reply.clearCookie(cookie.name, sessionCookieOptions(cookie));
}
