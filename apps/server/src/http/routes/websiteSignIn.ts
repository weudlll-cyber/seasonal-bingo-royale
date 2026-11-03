/**
 * @file   apps/server/src/http/routes/websiteSignIn.ts
 * @module server/http
 * @brief  GET <base>auth/website: the only place that reads the website's identity headers (D37).
 *
 * Responsibility: website mode only (local mode: the route does not exist, 404). The website's
 *                 proxy protects exactly this path with auth_request / forward_auth and passes
 *                 the visitor as headers. Accepted only from a peer in SBR_TRUSTED_PROXIES
 *                 (else 403, nobody signed in) and only with a valid id and name (else 403);
 *                 then the account by (site origin, user id) (../../auth/websiteAccounts; a
 *                 suspended one 403), a fresh game session (./auth openSession) and a redirect
 *                 to `next` when it is a path under the base path, else to the base path.
 *                 Rate-limited per address.
 * Depends on:     fastify, ../../auth/websiteIdentity, ../../auth/websiteAccounts, ./auth,
 *                 ../../auth/sessionPlugin (types), ../../auth/sessionEnds (types),
 *                 ../../config/env (types), ../../db/pool (types)
 * Used by:        ../app
 * Spec:           docs/spec/07-integration-architecture.md §2.3; docs/spec/03-security-architecture.md §2.2;
 *                 docs/spec/05-api-design.md §2.1
 */
import type { FastifyInstance } from 'fastify';

import type { CookieConfig } from '../../auth/sessionPlugin.js';
import type { SessionEnds } from '../../auth/sessionEnds.js';
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
export function safeNext(next: unknown, basePath: string): string {
  if (typeof next !== 'string' || next.length > 512 || !next.startsWith(basePath)) return basePath;
  return /^[\x21-\x7e]+$/.test(next) && !/\/\/|\\/.test(next) ? next : basePath;
}

export function registerWebsiteSignIn(app: FastifyInstance, deps: WebsiteSignInDeps): void {
  if (deps.env.SBR_AUTH_MODE !== 'website') return;
  const trusted = trustedPeers(deps.env.SBR_TRUSTED_PROXIES);
  // checkWebsiteMode (../../config/env) makes sure the public address is set.
  const issuer = new URL(deps.env.SBR_PUBLIC_URL ?? '').origin;
  const config = { rateLimit: { max: 30, timeWindow: 60_000 } };
  app.get<{ Querystring: { next?: string } }>(
    '/auth/website',
    { config },
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      // The TCP peer, not X-Forwarded-For: only the website's proxy may name a visitor.
      if (!trusted(request.socket.remoteAddress)) {
        return reply.status(403).send({ code: 'UNTRUSTED_PROXY' });
      }
      const who = identityFrom(request.headers, deps.env);
      if (who === null) return reply.status(403).send({ code: 'NO_WEBSITE_USER' });
      const accountId = await websiteAccount(deps.pool, issuer, who);
      if (accountId === null) return reply.status(403).send({ code: 'ACCOUNT_SUSPENDED' });
      await openSession(request, reply, deps, accountId);
      return reply.redirect(safeNext(request.query.next, deps.env.SBR_BASE_PATH), 302);
    },
  );
}
