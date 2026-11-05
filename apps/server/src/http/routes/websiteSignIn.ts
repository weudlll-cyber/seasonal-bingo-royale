/**
 * @file   apps/server/src/http/routes/websiteSignIn.ts
 * @module server/http
 * @brief  GET <base>auth/website: the only place that reads the website's identity headers (D37).
 *
 * Responsibility: website mode only (local mode: the routes do not exist, 404). The website's
 *                 proxy protects exactly this path with auth_request / forward_auth and passes
 *                 the visitor as headers. Accepted only from a peer in SBR_TRUSTED_PROXIES that
 *                 sends the proxy secret (X-Sbr-Proxy-Secret, compared in constant time; else
 *                 403, nobody signed in); a guest answer (X-Acting-Guest: true) or no valid id
 *                 and name goes on to the login route below, the browser's game session
 *                 untouched; then the account by (site origin, user id) (../../auth/websiteAccounts; a
 *                 suspended one 403), a fresh game session of at most 7 days (./auth
 *                 openSession) and a redirect
 *                 to `next` when it is a path under the base path, else to the base path (D43).
 *                 Rate-limited per address. GET <base>auth/website/login: where the proxy
 *                 sends a visitor the website refused; a redirect to SBR_WEBSITE_LOGIN_PATH
 *                 with the sign-in route and `next` as return path (D43).
 * Depends on:     node:crypto, fastify, ../../auth/websiteIdentity, ../../auth/websiteAccounts, ./auth,
 *                 ../../auth/sessionPlugin (types), ../../auth/sessionEnds (types), ../../auth/sessions,
 *                 ../../auth/rateLimit, ../../config/env (types), ../../db/pool (types)
 * Used by:        ../app
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/03-security-architecture.md §2.2;
 *                 docs/spec/05-api-design.md §2.1
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { openRouteLimit } from '../../auth/rateLimit.js';
import type { CookieConfig } from '../../auth/sessionPlugin.js';
import type { SessionEnds } from '../../auth/sessionEnds.js';
import { findSession } from '../../auth/sessions.js';
import { websiteAccount } from '../../auth/websiteAccounts.js';
import { identityFrom, trustedPeers } from '../../auth/websiteIdentity.js';
import type { Env } from '../../config/env.js';
import type { DbPool } from '../../db/pool.js';
import { openSession } from './auth.js';

interface WebsiteSignInDeps {
  readonly env: Env;
  readonly pool: DbPool;
  readonly cookie: CookieConfig;
  readonly sessionEnds: SessionEnds;
}

// Where to go after signing in: a path under the base path (the client's page, its hash
// included, percent-encoded), never another site: printable ASCII only, no "//", no backslash.
function safeNext(next: unknown, basePath: string): string {
  if (typeof next !== 'string' || next.length > 512 || !next.startsWith(basePath)) return basePath;
  return /^[\x21-\x7e]+$/.test(next) && !/\/\/|\\/.test(next) ? next : basePath;
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

// A test for the proxy secret header, in constant time (both sides hashed to one length).
function proxySecret(expected: string): (sent: string | string[] | undefined) => boolean {
  const want = digest(expected);
  return (sent) => typeof sent === 'string' && timingSafeEqual(digest(sent), want);
}

const WEBSITE_SESSION_DAYS = 7;

export function registerWebsiteSignIn(app: FastifyInstance, deps: WebsiteSignInDeps): void {
  if (deps.env.SBR_AUTH_MODE !== 'website') return;
  const trusted = trustedPeers(deps.env.SBR_TRUSTED_PROXIES);
  // checkWebsiteMode (../../config/env) makes sure the public address and the secret are set.
  const fromProxy = proxySecret(deps.env.SBR_WEBSITE_PROXY_SECRET ?? '');
  const issuer = new URL(deps.env.SBR_PUBLIC_URL ?? '').origin;
  const base = deps.env.SBR_BASE_PATH;
  const config = { rateLimit: { max: 30, timeWindow: 60_000 } };
  // An invalid steps header is logged once per process (sign-in goes on without steps).
  let warnedSteps = false;
  const loginHop = (next: string | undefined) =>
    `${base}auth/website/login?next=${encodeURIComponent(safeNext(next, base))}`;
  // D43: the proxy sends a visitor the website does not know here; on to the website's login
  // with the sign-in route and the wanted page as its return path (encoded twice: the page is
  // a parameter of the sign-in route, which is the login's parameter).
  app.get<{ Querystring: { next?: string } }>(
    '/auth/website/login',
    { config: openRouteLimit() },
    (request, reply) => {
      const back = `${base}auth/website?next=${encodeURIComponent(safeNext(request.query.next, base))}`;
      reply.header('cache-control', 'no-store');
      return reply.redirect(`${deps.env.SBR_WEBSITE_LOGIN_PATH}${encodeURIComponent(back)}`, 302);
    },
  );
  app.get<{ Querystring: { next?: string } }>(
    '/auth/website',
    { config },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      // The TCP peer, not X-Forwarded-For: only the website's proxy may name a visitor.
      // And the proxy secret: another process on a trusted address names nobody.
      if (
        !trusted(request.socket.remoteAddress) ||
        !fromProxy(request.headers['x-sbr-proxy-secret'])
      ) {
        return reply.status(403).send({ code: 'UNTRUSTED_PROXY' });
      }
      // The website answers a visitor it does not sign in with 204 + X-Acting-Guest (so the
      // proxy's error_page never fires): on to its login; the browser's game session stays.
      const who = identityFrom(request.headers, deps.env);
      if (who === null) return reply.redirect(loginHop(request.query.next), 302);
      if (who.badSteps && !warnedSteps) {
        warnedSteps = true;
        request.log.warn('the website sent a steps header that is no valid steps list; ignored');
      }
      const accountId = await websiteAccount(deps.pool, issuer, who);
      if (accountId === null) return reply.status(403).send({ code: 'ACCOUNT_SUSPENDED' });
      // This route is outside /api, where the session hook does not look: find the browser's
      // session here, so the new one replaces it (03 §3; audit-3 S2).
      const token = request.cookies[deps.cookie.name];
      request.session = token === undefined ? null : await findSession(deps.pool, token);
      // In website mode a game session lives at most 7 days (2026-11-04).
      await openSession(request, reply, deps, accountId, WEBSITE_SESSION_DAYS);
      return reply.redirect(safeNext(request.query.next, base), 302);
    },
  );
}
