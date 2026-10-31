/**
 * @file   apps/server/src/http/app.ts
 * @module server/http
 * @brief  Builds the Fastify instance of the server with every plugin and route wired.
 *
 * Responsibility: wire logging, security headers, problem-details, health, metrics, the
 *                 built client (image) or the placeholder page (development), sessions and
 *                 auth, the live match engine and its routes onto a fresh Fastify instance,
 *                 under the base path (SBR_BASE_PATH) and behind the trusted proxies; first
 *                 of all, refuse a seed key that does not open the stored match secrets.
 *                 The caller owns the lifecycle (listen, scheduler, close, pool disposal).
 * Depends on:     fastify, @fastify/rate-limit, prom-client (indirectly), ../db/pool, ../auth/sessionEnds,
 *                 ../auth/sessionPlugin, ../config/env, ../config/features,
 *                 ../config/maintenance, ../config/seedKey, ./plugins/problem,
 *                 ./plugins/securityHeaders, ./routes/auth, ./routes/devSignIn,
 *                 ./routes/health, ./routes/maintenance, ./routes/matches, ./routes/matchVerify,
 *                 ./routes/metrics, ./routes/placeholder,
 *                 ./routes/quicktest, ./routes/webClient, ../match/runtime, ../realtime/gateway
 * Used by:        ../main.ts, test/*, ../index
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/05-api-design.md §1
 */
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { SessionEnds } from '../auth/sessionEnds.js';
import { cookieConfig, registerSessions } from '../auth/sessionPlugin.js';
import { allowedOrigins, type Env } from '../config/env.js';
import { featuresFrom } from '../config/features.js';
import { maintenanceFlag } from '../config/maintenance.js';
import { seedKeyFrom } from '../config/seedKey.js';
import type { DbPool } from '../db/pool.js';
import { createMatchRuntime, type MatchRuntime } from '../match/runtime.js';
import { attachGateway } from '../realtime/gateway.js';
import { registerProblemDetails } from './plugins/problem.js';
import { registerSecurityHeaders } from './plugins/securityHeaders.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDevSignIn } from './routes/devSignIn.js';
import { registerHealth } from './routes/health.js';
import { registerMaintenance } from './routes/maintenance.js';
import { registerMatchRoutes } from './routes/matches.js';
import { registerVerifyRoute } from './routes/matchVerify.js';
import { createMetrics, registerMetrics, type MetricsHandle } from './routes/metrics.js';
import { registerPlaceholder } from './routes/placeholder.js';
import { registerQuickTest } from './routes/quicktest.js';
import { registerWebClient } from './routes/webClient.js';

interface AppDeps {
  readonly env: Env;
  readonly pool: DbPool;
}

export interface App {
  readonly fastify: FastifyInstance;
  readonly metrics: MetricsHandle;
  // The live match engine; main starts its scheduler (tests start it when they need it).
  readonly match: MatchRuntime;
}

// Fastify with the logger, the trusted proxies (Caddy, 09 §1) and the base path: behind
// the website the app lives under /games/bingo/ and the routes see the path without it.
function createFastify(env: Env): FastifyInstance {
  // Fastify builds the pino logger from this options object; passing a pre-made pino
  // instance would widen generics in a way exactOptionalPropertyTypes rejects.
  const loggerOptions: FastifyServerOptions['logger'] =
    env.NODE_ENV === 'test'
      ? false
      : {
          level: env.SBR_LOG_LEVEL,
          ...(env.SBR_DEV
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        };
  const proxies = env.SBR_TRUSTED_PROXIES;
  return Fastify({
    logger: loggerOptions,
    disableRequestLogging: env.NODE_ENV === 'test',
    trustProxy: proxies.length > 0 ? proxies : false,
    rewriteUrl: (request) => withoutBase(request.url ?? '/', env.SBR_BASE_PATH),
  });
}

// Per-route limits for the routes that ask for one (config.rateLimit: Verify, the load
// check's clean-up); the API-wide limit lives in the sessions (../auth/sessionPlugin).
async function registerRouteLimits(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, code: 'RATE_LIMITED', message: 'Too many' }),
  });
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const seedKey = seedKeyFrom(deps.env);
  const maintenance = maintenanceFlag(deps.env.SBR_DATA_DIR);
  const match = createMatchRuntime(deps.pool, seedKey, maintenance);
  // A wrong seed key stops the server before anything is built, not at the first match it
  // loads (the stored match secrets are sealed with it, 03 §9).
  await match.store.checkKey();
  const fastify = createFastify(deps.env);
  // Development features only with SBR_DEV=1 (fail closed, audit S1).
  const isDev = deps.env.SBR_DEV;
  await registerSecurityHeaders(fastify);
  registerProblemDetails(fastify);
  await registerRouteLimits(fastify);
  const metrics = createMetrics();
  registerMetrics(fastify, metrics);
  registerHealth(fastify, deps.pool);
  // The built client in the image; the placeholder page in development (Vite serves it).
  if (deps.env.SBR_WEB_DIR === undefined) {
    registerPlaceholder(fastify, { dev: isDev, port: deps.env.SBR_PORT });
  } else {
    registerWebClient(fastify, deps.env.SBR_WEB_DIR);
  }
  if (isDev) registerQuickTest(fastify);
  const cookie = cookieConfig(!isDev, deps.env.SBR_BASE_PATH);
  const sessionEnds = new SessionEnds();
  await registerSessions(fastify, deps.pool, cookie);
  registerAuthRoutes(fastify, {
    pool: deps.pool,
    cookie,
    features: featuresFrom(deps.env),
    sessionEnds,
  });
  // Development only: quick sign-in as host or player (never in a production build).
  if (isDev) registerDevSignIn(fastify, { pool: deps.pool, cookie, sessionEnds });
  registerMaintenance(fastify, maintenance);
  registerMatchRoutes(fastify, {
    pool: deps.pool,
    engine: match.engine,
    store: match.store,
    dev: isDev,
    maintenance,
  });
  // "Verify this match": the seed, sealed with this key, opens once a match is over.
  registerVerifyRoute(fastify, { pool: deps.pool, store: match.store, seedKey });
  const io = attachGateway(fastify.server, {
    pool: deps.pool,
    engine: match.engine,
    bus: match.bus,
    cookieName: cookie.name,
    allowedOrigins: allowedOrigins(deps.env),
    path: `${deps.env.SBR_BASE_PATH}ws`,
    sessionEnds,
  });
  fastify.addHook('onClose', async () => {
    await io.close();
  });
  return { fastify, metrics, match };
}

// "/games/bingo/api/v1/x" → "/api/v1/x" when the base path is "/games/bingo/".
function withoutBase(url: string, base: string): string {
  if (base === '/') return url;
  if (url === base.slice(0, -1)) return '/';
  return url.startsWith(base) ? url.slice(base.length - 1) : url;
}
