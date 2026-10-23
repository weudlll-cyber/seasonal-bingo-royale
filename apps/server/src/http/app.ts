/**
 * @file   apps/server/src/http/app.ts
 * @module server/http
 * @brief  Builds the Fastify instance of the server with every plugin and route wired.
 *
 * Responsibility: wire logging, security headers, problem-details, health, metrics, the
 *                 built client (image) or the placeholder page (development), sessions and
 *                 auth, the live match engine and its routes onto a fresh Fastify instance,
 *                 under the base path (SBR_BASE_PATH) and behind the trusted proxies. The caller owns the lifecycle (listen,
 *                 scheduler, close, pool disposal).
 * Depends on:     fastify, pino, prom-client (indirectly), ../db/pool
 * Used by:        ../main.ts, test/*
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/05-api-design.md §1
 */
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

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
import { registerMatchRoutes } from './routes/matches.js';
import { createMetrics, registerMetrics, type MetricsHandle } from './routes/metrics.js';
import { registerPlaceholder } from './routes/placeholder.js';
import { registerQuickTest } from './routes/quicktest.js';
import { registerWebClient } from './routes/webClient.js';

export interface AppDeps {
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
          ...(env.NODE_ENV === 'production'
            ? {}
            : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
        };
  const proxies = env.SBR_TRUSTED_PROXIES;
  return Fastify({
    logger: loggerOptions,
    disableRequestLogging: env.NODE_ENV === 'test',
    trustProxy: proxies.length > 0 ? proxies : false,
    rewriteUrl: (request) => withoutBase(request.url ?? '/', env.SBR_BASE_PATH),
  });
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const fastify = createFastify(deps.env);
  const isDev = deps.env.NODE_ENV !== 'production';
  await registerSecurityHeaders(fastify);
  if (isDev) registerDevCors(fastify);
  registerProblemDetails(fastify);
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
  const cookie = cookieConfig(deps.env.NODE_ENV === 'production');
  await registerSessions(fastify, deps.pool, cookie);
  registerAuthRoutes(fastify, { pool: deps.pool, cookie, features: featuresFrom(deps.env) });
  // Development only: quick sign-in as host or player (never in a production build).
  if (isDev) registerDevSignIn(fastify, { pool: deps.pool, cookie });
  const match = createMatchRuntime(deps.pool, seedKeyFrom(deps.env));
  registerMatchRoutes(fastify, {
    pool: deps.pool,
    engine: match.engine,
    store: match.store,
    dev: isDev,
    maintenance: maintenanceFlag(deps.env.SBR_DATA_DIR),
  });
  const io = attachGateway(fastify.server, {
    pool: deps.pool,
    engine: match.engine,
    bus: match.bus,
    cookieName: cookie.name,
    allowedOrigins: allowedOrigins(deps.env),
    path: `${deps.env.SBR_BASE_PATH}ws`,
  });
  fastify.addHook('onClose', async () => {
    await io.close();
  });
  return { fastify, metrics, match };
}

// "/games/bingo/api/v1/x" → "/api/v1/x" when the base path is "/games/bingo/".
export function withoutBase(url: string, base: string): string {
  if (base === '/') return url;
  if (url === base.slice(0, -1)) return '/';
  return url.startsWith(base) ? url.slice(base.length - 1) : url;
}

// The player client (Vite on 127.0.0.1:5390) is a different origin from the server
// (127.0.0.1:3900); the dev-only Quick Test endpoint accepts cross-origin POSTs so the
// client can call it directly without a Vite proxy. Not registered in production.
function registerDevCors(app: FastifyInstance): void {
  app.addHook('onSend', (request, reply, _payload, done) => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):53\d\d$/.test(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-headers', 'content-type');
      reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
    }
    done();
  });
  app.options('/dev/quicktest', (_request, reply) => reply.status(204).send());
}
