/**
 * @file   apps/server/src/http/routes/websiteSignIn.ts
 * @module server/http
 * @brief  GET <base>auth/website: the only place that reads the website's identity headers (D37).
 *
 * Responsibility: website mode only (local mode: the routes do not exist, 404). The website's
 *                 proxy protects exactly this path with auth_request / forward_auth and passes
 *                 the visitor as headers. The kit's check (@seasonal/kit/server
 *                 websiteSignInCheck, with this install's header names and `steps: 'all'`): only
 *                 from a peer in SBR_TRUSTED_PROXIES that sends the proxy secret
 *                 (X-Sbr-Proxy-Secret, constant time; else 403, nobody signed in); a guest answer
 *                 or no valid identity (the website's numeric id, a name, one role) goes on to the
 *                 login route below, the browser's game session untouched; then the account by
 *                 (site origin, user id) (../../auth/websiteAccounts; a suspended one 403), a
 *                 fresh game session of at most 7 days (./auth openSession) and a redirect to
 *                 `next` when it is a path under the base path, else to the base path (D43; the
 *                 kit's safeNext). Rate-limited per address. GET <base>auth/website/login: where
 *                 the proxy sends a visitor the website refused; a redirect to
 *                 SBR_WEBSITE_LOGIN_PATH with the sign-in route and `next` as return path (D43;
 *                 the kit's websiteLoginLocation).
 * Depends on:     fastify, @seasonal/kit/server, ../../auth/websiteAccounts, ./auth,
 *                 ../../auth/sessionPlugin (types), @seasonal/kit/server (SessionEnds, types), ../../auth/sessions,
 *                 ../../auth/rateLimit, ../../config/env (types), ../../db/pool (types)
 * Used by:        ../app
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/03-security-architecture.md §2.2;
 *                 docs/spec/05-api-design.md §2.1; docs/concepts/kit-adoption.md §2 (B4)
 */
import {
  safeNext,
  websiteLoginLocation,
  websiteSignInCheck,
  type IdentityHeaders,
} from '@seasonal/kit/server';
import type { FastifyInstance } from 'fastify';

import { openRouteLimit } from '../../auth/rateLimit.js';
import type { CookieConfig } from '../../auth/sessionPlugin.js';
import type { SessionEnds } from '@seasonal/kit/server';
import { findSession, WEBSITE_SESSION_DAYS } from '../../auth/sessions.js';
import { websiteAccount } from '../../auth/websiteAccounts.js';
import type { Env } from '../../config/env.js';
import type { DbPool } from '../../db/pool.js';
import { openSession } from './auth.js';
import { sessionLengthsOf, type LiveTechnical } from '../../config/technical.js';

interface WebsiteSignInDeps {
  readonly env: Env;
  readonly pool: DbPool;
  readonly cookie: CookieConfig;
  readonly sessionEnds: SessionEnds;
  // The Technical section's session lengths (members and guests keep 7 days at most here).
  readonly technical?: LiveTechnical;
}

// A member's session lengths here: the Technical section's, at most 7 days (2026-11-04).
const lengthsOf = (deps: WebsiteSignInDeps) =>
  deps.technical === undefined
    ? undefined
    : sessionLengthsOf(deps.technical(), WEBSITE_SESSION_DAYS);

// This install's names of the website's identity headers (../../config/env).
const namesOf = (env: Env): IdentityHeaders => ({
  id: env.SBR_WEBSITE_HEADER_ID,
  name: env.SBR_WEBSITE_HEADER_NAME,
  roles: env.SBR_WEBSITE_HEADER_ROLES,
  emailVerified: env.SBR_WEBSITE_HEADER_EMAIL_VERIFIED,
  canHost: env.SBR_WEBSITE_HEADER_CAN_HOST,
  steps: env.SBR_WEBSITE_HEADER_STEPS,
  guest: env.SBR_WEBSITE_HEADER_GUEST,
});

export function registerWebsiteSignIn(app: FastifyInstance, deps: WebsiteSignInDeps): void {
  if (deps.env.SBR_AUTH_MODE !== 'website') return;
  // checkWebsiteMode (../../config/env) makes sure the public address and the secret are set.
  // The whole steps list or none: an invalid list is logged once (below).
  const check = websiteSignInCheck({
    trustedProxies: deps.env.SBR_TRUSTED_PROXIES,
    proxySecret: deps.env.SBR_WEBSITE_PROXY_SECRET ?? '',
    secretHeader: 'x-sbr-proxy-secret',
    steps: 'all',
    names: namesOf(deps.env),
  });
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
      reply.header('cache-control', 'no-store');
      const login = websiteLoginLocation(deps.env.SBR_WEBSITE_LOGIN_PATH, base, request.query.next);
      return reply.redirect(login, 302);
    },
  );
  app.get<{ Querystring: { next?: string } }>(
    '/auth/website',
    { config },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      // The TCP peer, not X-Forwarded-For: only the website's proxy may name a visitor.
      // And the proxy secret: another process on a trusted address names nobody.
      const decision = check(request.socket.remoteAddress, request.headers);
      if (decision.kind === 'untrusted') return reply.status(403).send({ code: 'UNTRUSTED_PROXY' });
      // The website answers a visitor it does not sign in with 204 + X-Acting-Guest (so the
      // proxy's error_page never fires): on to its login; the browser's game session stays.
      if (decision.kind !== 'member') return reply.redirect(loginHop(request.query.next), 302);
      const who = decision.identity;
      if (who.badSteps && !warnedSteps) {
        warnedSteps = true;
        request.log.warn('the website sent a steps header that is no valid steps list; ignored');
      }
      const accountId = await websiteAccount(deps.pool, issuer, who);
      if (accountId === null) return reply.status(403).send({ code: 'ACCOUNT_SUSPENDED' });
      // This route is outside /api, where the session hook does not look: find the browser's
      // session here, so the new one replaces it (03 §3; audit-3 S2).
      const token = request.cookies[deps.cookie.name];
      request.session =
        token === undefined ? null : await findSession(deps.pool, token, lengthsOf(deps));
      // In website mode a game session lives at most 7 days (2026-11-04).
      await openSession(request, reply, { ...deps, playerDays: WEBSITE_SESSION_DAYS }, accountId);
      return reply.redirect(safeNext(request.query.next, base), 302);
    },
  );
}
