/**
 * @file   apps/server/src/http/app.ts
 * @module server/http
 * @brief  Builds the Fastify instance of the server with every plugin and route wired.
 *
 * Responsibility: wire logging, security headers, problem-details, health, metrics, the
 *                 built client (image) or the placeholder page (development), sessions and
 *                 sign-in (local accounts, or in website mode the website's proxy headers, D37,
 *                 and its account-changes feed, ../website/accountFeed, polled from main),
 *                 the live match engine and its routes (in development on the time-travel
 *                 clock, with its route), the leaderboards and profiles (in development also the
 *                 demo league) onto a fresh Fastify instance, under the base path and behind the
 *                 trusted proxies; first of all, refuse a seed key that does not open the stored
 *                 match secrets. The caller owns the lifecycle (listen, scheduler, close, pool).
 * Depends on:     fastify, @fastify/rate-limit, prom-client (indirectly), ../db/pool,
 *                 ../auth/sessionEnds, ../auth/sessionPlugin, ../website/accountFeed, ../config/env, ../config/features,
 *                 ../config/maintenance, ../config/seedKey, ../dev/devClock, ../dev/demoLeague,
 *                 ./plugins/problem, ./plugins/securityHeaders, ./routes/auth, ./routes/devSignIn,
 *                 ./routes/health, ./routes/leaderboards, ./routes/maintenance, ./routes/matches,
 *                 ./routes/matchVerify, ./routes/metrics, ./routes/placeholder, ./routes/profiles,
 *                 ./routes/quicktest, ./routes/timeTravel, ./routes/webClient, ./routes/websiteSignIn,
 *                 ../match/runtime,
 *                 ../realtime/gateway
 * Used by:        ../main.ts, test/*, ../index
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/05-api-design.md §1
 */
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { SessionEnds } from '../auth/sessionEnds.js';
import { AccountFeed } from '../website/accountFeed.js';
import { registerOpenRounds } from './routes/openRounds.js';
import { cookieConfig, registerSessions, type CookieConfig } from '../auth/sessionPlugin.js';
import { allowedOrigins, type Env } from '../config/env.js';
import { featuresFrom } from '../config/features.js';
import { maintenanceFlag, type MaintenanceCheck } from '../config/maintenance.js';
import { seedKeyFrom } from '../config/seedKey.js';
import type { DbPool } from '../db/pool.js';
import { DevClock } from '../dev/devClock.js';
import { registerDemoLeague } from '../dev/demoLeague.js';
import { createMatchRuntime, type MatchRuntime } from '../match/runtime.js';
import { attachGateway, type GatewayDeps } from '../realtime/gateway.js';
import { liveViewsOn, type LiveViews } from '../view/liveViews.js';
import { registerProblemDetails } from './plugins/problem.js';
import { registerSecurityHeaders } from './plugins/securityHeaders.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDevSignIn } from './routes/devSignIn.js';
import { registerHealth } from './routes/health.js';
import { registerLeaderboardRoutes } from './routes/leaderboards.js';
import { registerMaintenance } from './routes/maintenance.js';
import { registerMatchRoutes } from './routes/matches.js';
import { registerVerifyRoute } from './routes/matchVerify.js';
import {
  createMetrics,
  registerMetrics,
  type LiveMetrics,
  type MetricsHandle,
} from './routes/metrics.js';
import { registerPlaceholder } from './routes/placeholder.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerQuickTest } from './routes/quicktest.js';
import { registerTimeTravel } from './routes/timeTravel.js';
import { registerWebClient } from './routes/webClient.js';
import { registerWebsiteSignIn } from './routes/websiteSignIn.js';

interface AppDeps {
  readonly env: Env;
  readonly pool: DbPool;
}

export interface App {
  readonly fastify: FastifyInstance;
  readonly metrics: MetricsHandle;
  // The live match engine; main starts its scheduler (tests start it when they need it).
  readonly match: MatchRuntime;
  // Website mode with the sync token: the account-changes feed; main starts its polls.
  readonly feed: AccountFeed | null;
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

interface GameRouteDeps {
  readonly env: Env;
  readonly pool: DbPool;
  readonly isDev: boolean;
  readonly maintenance: MaintenanceCheck;
  readonly seedKey: Buffer;
  readonly match: MatchRuntime;
  // Development only: the time-travel clock the match runtime runs on.
  readonly clock: DevClock | undefined;
  readonly live: LiveMetrics;
  readonly views: LiveViews;
}

// The matches, Verify, the leaderboards and profiles; in development the time travel.
function registerGameRoutes(fastify: FastifyInstance, deps: GameRouteDeps): void {
  const { pool, match } = deps;
  registerMatchRoutes(fastify, {
    pool,
    engine: match.engine,
    store: match.store,
    dev: deps.isDev,
    maintenance: deps.maintenance,
    live: deps.live,
    views: deps.views,
    website: deps.env.SBR_AUTH_MODE === 'website',
  });
  // The open sign-ups the hosts marked for the website (D50; empty in standalone installs).
  registerOpenRounds(fastify, {
    pool,
    publicUrl: deps.env.SBR_PUBLIC_URL ?? null,
    basePath: deps.env.SBR_BASE_PATH,
  });
  // "Verify this match": the seed, sealed with this key, opens once a match is over.
  registerVerifyRoute(fastify, { pool, store: match.store, seedKey: deps.seedKey });
  registerLeaderboardRoutes(fastify, { pool });
  registerProfileRoutes(fastify, { pool });
  // Development only: ten demo accounts and three counting matches for the boards.
  if (deps.isDev) registerDemoLeague(fastify, { pool, engine: match.engine });
  if (deps.clock !== undefined) {
    const clock = deps.clock;
    registerTimeTravel(fastify, { pool, engine: match.engine, scheduler: match.scheduler, clock });
  }
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const seedKey = seedKeyFrom(deps.env);
  const maintenance = maintenanceFlag(deps.env.SBR_DATA_DIR);
  // Development features only with SBR_DEV=1 (fail closed, audit S1).
  const isDev = deps.env.SBR_DEV;
  // Development builds run matches on a clock the time travel can move ahead (WP-14).
  const clock = isDev ? new DevClock() : undefined;
  const metrics = createMetrics();
  const match = createMatchRuntime(deps.pool, seedKey, maintenance, {
    clock,
    onTapBatch: metrics.taps.batch,
    onAppend: metrics.taps.appended,
  });
  // A wrong seed key stops the server before anything is built, not at the first match it
  // loads (the stored match secrets are sealed with it, 03 §9).
  await match.store.checkKey();
  const fastify = createFastify(deps.env);
  // Without a built client the placeholder page shows, styled inline (./routes/placeholder).
  await registerSecurityHeaders(fastify, { devPage: deps.env.SBR_WEB_DIR === undefined });
  registerProblemDetails(fastify);
  await registerRouteLimits(fastify);
  registerMetrics(fastify, metrics);
  registerHealth(fastify, deps.pool);
  registerClient(fastify, deps.env);
  if (isDev) registerQuickTest(fastify);
  const cookie = cookieConfig(!isDev, deps.env.SBR_BASE_PATH);
  const sessionEnds = new SessionEnds();
  await registerSessions(fastify, deps.pool, cookie);
  // One replay per live match, for the state fetches and the live frames alike.
  const views = liveViewsOn(deps.pool, match.store);
  const accountDeleted = (id: string): void => {
    views.accountGone(id);
  };
  const feed = registerSignIn(fastify, { ...deps, cookie, sessionEnds, accountDeleted });
  registerMaintenance(fastify, maintenance);
  registerGameRoutes(fastify, {
    env: deps.env,
    pool: deps.pool,
    isDev,
    maintenance,
    seedKey,
    match,
    clock,
    live: metrics.live,
    views,
  });
  registerGateway(fastify, {
    pool: deps.pool,
    engine: match.engine,
    bus: match.bus,
    cookieName: cookie.name,
    allowedOrigins: allowedOrigins(deps.env),
    path: `${deps.env.SBR_BASE_PATH}ws`,
    sessionEnds,
    taps: metrics.taps,
    live: metrics.live,
    views,
  });
  return { fastify, metrics, match, feed };
}

// The WebSocket gateway on the same server, closed with it.
function registerGateway(fastify: FastifyInstance, deps: GatewayDeps): void {
  const io = attachGateway(fastify.server, deps);
  fastify.addHook('onClose', async () => {
    await io.close();
  });
}

// How players sign in: the game's own accounts, or in website mode only through the
// website (D37); in development (local mode) also the quick sign-in, never in production.
// Website mode with the sync token: the account-changes feed (07 §2.4), returned for main.
function registerSignIn(
  fastify: FastifyInstance,
  deps: {
    env: Env;
    pool: DbPool;
    cookie: CookieConfig;
    sessionEnds: SessionEnds;
    accountDeleted: (accountId: string) => void;
  },
): AccountFeed | null {
  const { env } = deps;
  registerAuthRoutes(fastify, {
    ...deps,
    features: featuresFrom(env),
    mode: env.SBR_AUTH_MODE,
    basePath: env.SBR_BASE_PATH,
  });
  registerWebsiteSignIn(fastify, deps);
  if (env.SBR_DEV && env.SBR_AUTH_MODE === 'local') registerDevSignIn(fastify, deps);
  if (env.SBR_AUTH_MODE !== 'website' || env.SBR_WEBSITE_SYNC_TOKEN === undefined) return null;
  return new AccountFeed({
    ...deps,
    issuer: new URL(env.SBR_PUBLIC_URL ?? '').origin,
    url: env.SBR_WEBSITE_FEED_URL,
    token: env.SBR_WEBSITE_SYNC_TOKEN,
    dataDir: env.SBR_DATA_DIR,
    warn: (message) => {
      fastify.log.warn(message);
    },
  });
}

// The built client in the image; the placeholder page in development (Vite serves it).
function registerClient(fastify: FastifyInstance, env: Env): void {
  if (env.SBR_WEB_DIR === undefined) {
    registerPlaceholder(fastify, { dev: env.SBR_DEV, port: env.SBR_PORT });
  } else {
    registerWebClient(fastify, env.SBR_WEB_DIR);
  }
}

// "/games/bingo/api/v1/x" → "/api/v1/x" when the base path is "/games/bingo/".
function withoutBase(url: string, base: string): string {
  if (base === '/') return url;
  if (url === base.slice(0, -1)) return '/';
  return url.startsWith(base) ? url.slice(base.length - 1) : url;
}
