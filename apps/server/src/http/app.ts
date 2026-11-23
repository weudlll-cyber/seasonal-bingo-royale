/**
 * @file   apps/server/src/http/app.ts
 * @module server/http
 * @brief  Builds the Fastify instance of the server with every plugin and route wired.
 *
 * Responsibility: wire logging, security headers, problem-details, health, metrics, the
 *                 built client (image) or the placeholder page (development), sessions and
 *                 sign-in (local accounts, or in website mode the website's proxy headers, D37,
 *                 and its account-changes feed, ../website/accountFeed, polled from main),
 *                 the live match engine and the game's routes (./gameRoutes: matches, Verify,
 *                 boards and profiles, the admin area; in development the demo league and the
 *                 time travel on the time-travel clock), with the admin area's settings loaded
 *                 and the built-in presets seeded at start (../admin/settings, ../admin/presets), onto a fresh Fastify instance, under the base
 *                 path and behind the trusted proxies; first of all, refuse a seed key that does
 *                 not open the stored match secrets. The caller owns the lifecycle (listen,
 *                 scheduler, close, pool).
 * Depends on:     fastify, @fastify/rate-limit, prom-client (indirectly), ../db/pool,
 *                 ../admin/presets, ../admin/settings, @seasonal/kit/server (SessionEnds), ../auth/sessionPlugin,
 *                 ../website/accountFeed, ../config/env, ../config/features,
 *                 ../config/maintenance, ../config/seedKey, ../dev/devClock, ./plugins/problem,
 *                 ./plugins/securityHeaders, ./gameRoutes, ./signIn, ./routes/health,
 *                 ./routes/maintenance, ./routes/metrics, ./routes/placeholder,
 *                 ./routes/quicktest, ./routes/webClient, ../match/runtime, ../realtime/gateway
 * Used by:        ../main.ts, test/*, ../index
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/05-api-design.md §1
 */
import rateLimit from '@fastify/rate-limit';
import {
  clientScreensOf,
  leagueConfigOf,
  leagueSettingsOf,
  screenSettingsOf,
} from '@sbr/contracts';
import { SessionEnds } from '@seasonal/kit/server';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { Presets } from '../admin/presets.js';
import { SettingsStore } from '../admin/settings.js';
import { SocketLimits } from '../realtime/socketLimits.js';
import { registerGameRoutes } from './gameRoutes.js';
import { registerSignIn } from './signIn.js';
import type { AccountFeed } from '../website/accountFeed.js';
import type { Mailer } from '../auth/mailer.js';
import { cookieConfig, registerSessions } from '../auth/sessionPlugin.js';
import { allowedOrigins, type Env } from '../config/env.js';
import { liveSwitches, type Switches } from '../config/features.js';
import { liveTechnical, sessionLengthsOf, type LiveTechnical } from '../config/technical.js';
import { maintenanceFlag } from '../config/maintenance.js';
import { seedKeyFrom } from '../config/seedKey.js';
import type { DbPool } from '../db/pool.js';
import { DevClock } from '../dev/devClock.js';
import { createMatchRuntime, type MatchRuntime } from '../match/runtime.js';
import { attachGateway, type GatewayDeps } from '../realtime/gateway.js';
import { SeenLive } from '../realtime/seenLive.js';
import { liveViewsOn } from '../view/liveViews.js';
import { registerProblemDetails } from './plugins/problem.js';
import { registerSecurityHeaders } from './plugins/securityHeaders.js';
import { registerHealth } from './routes/health.js';
import { registerMaintenance } from './routes/maintenance.js';
import { createMetrics, registerMetrics, type MetricsHandle } from './routes/metrics.js';
import { registerPlaceholder } from './routes/placeholder.js';
import { registerQuickTest } from './routes/quicktest.js';
import { registerWebClient } from './routes/webClient.js';

interface AppDeps {
  readonly env: Env;
  readonly pool: DbPool;
  // Outgoing mail; tests pass their own, else ../auth/mailer from the SMTP settings.
  readonly mailer?: Mailer | null;
}

export interface App {
  readonly fastify: FastifyInstance;
  readonly metrics: MetricsHandle;
  // The live match engine; main starts its scheduler (tests start it when they need it).
  readonly match: MatchRuntime;
  // Website mode with the sync token: the account-changes feed; main starts its polls.
  readonly feed: AccountFeed | null;
  // Tests wait on the work, not on time: a match's events all sent as live steps, and the
  // steps players watched written as seen (../realtime/liveSteps, ../realtime/seenLive).
  readonly live: {
    readonly settled: (matchId: string) => Promise<void>;
    readonly seenNow: () => Promise<void>;
  };
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

// The match runtime's clock and meters; the league's rules read when a match's points are
// awarded: the League settings, and confirmed e-mail addresses in website mode or with the
// e-mail switch on in a standalone install (D59).
const runtimeOptions = (
  env: Env,
  metrics: MetricsHandle,
  clock: DevClock | undefined,
  live: { readonly settings: SettingsStore; readonly switches: () => Switches },
) => ({
  clock,
  onTapBatch: metrics.taps.batch,
  onAppend: metrics.taps.appended,
  league: () => ({
    config: leagueConfigOf(leagueSettingsOf(live.settings.get('leaderboard'))),
    needsVerifiedEmail: env.SBR_AUTH_MODE === 'website' || live.switches().emailVerification,
  }),
});

// The admin area's settings, read by the server at runtime (../admin/settings), the presets
// and the switches read from them.
async function loadSettings(pool: DbPool, env: Env) {
  const settings = new SettingsStore(pool);
  await settings.load();
  // The built-in presets, unless an earlier start seeded them (../admin/presets).
  const presets = new Presets(settings);
  await presets.seed();
  // The screen values the session answer sends (admin-area §8 (i)), as they are now.
  const screens = () => clientScreensOf(screenSettingsOf(settings.get('screens')));
  return {
    settings,
    presets,
    screens,
    switches: liveSwitches(env, settings),
    // The Technical section's values, read on every use (../config/technical).
    technical: liveTechnical(env, settings),
  };
}

// The meters, health, the client (or the placeholder) and in development the Quick Test.
function registerBasics(fastify: FastifyInstance, deps: AppDeps, metrics: MetricsHandle): void {
  registerMetrics(fastify, metrics);
  registerHealth(fastify, deps.pool);
  registerClient(fastify, deps.env);
  if (deps.env.SBR_DEV) registerQuickTest(fastify);
}

// Ended sessions told to their listeners (the sockets); a listener that fails goes to the log.
const sessionEndsOf = (fastify: FastifyInstance): SessionEnds =>
  new SessionEnds((error) => {
    fastify.log.error({ err: error }, 'a listener of ended sessions failed');
  });

export async function buildApp(deps: AppDeps): Promise<App> {
  const seedKey = seedKeyFrom(deps.env);
  const maintenance = maintenanceFlag(deps.env.SBR_DATA_DIR);
  // Development features only with SBR_DEV=1 (fail closed, audit S1).
  const isDev = deps.env.SBR_DEV;
  // Development builds run matches on a clock the time travel can move ahead (WP-14).
  const clock = isDev ? new DevClock() : undefined;
  const metrics = createMetrics();
  // The admin area's settings, presets, screen values and switches (../admin/settings).
  const loaded = await loadSettings(deps.pool, deps.env);
  const options = runtimeOptions(deps.env, metrics, clock, loaded);
  const match = createMatchRuntime(deps.pool, seedKey, maintenance, options);
  // A wrong seed key stops the server before anything is built, not at the first match it
  // loads (the stored match secrets are sealed with it, 03 §9).
  await match.store.checkKey();
  const fastify = createFastify(deps.env);
  // Without a built client the placeholder page shows, styled inline (./routes/placeholder).
  await registerSecurityHeaders(fastify, { devPage: deps.env.SBR_WEB_DIR === undefined });
  registerProblemDetails(fastify);
  await registerRouteLimits(fastify);
  registerBasics(fastify, deps, metrics);
  const cookie = cookieConfig(!isDev, deps.env.SBR_BASE_PATH);
  const sessionEnds = sessionEndsOf(fastify);
  await registerSessions(fastify, deps.pool, cookie, loaded.technical);
  // One replay per live match, for the state fetches and the live frames alike.
  const views = liveViewsOn(deps.pool, match.store);
  const accountDeleted = (id: string): void => {
    views.accountGone(id);
  };
  const feed = registerSignIn(fastify, {
    ...deps,
    cookie,
    sessionEnds,
    accountDeleted,
    ...loaded,
  });
  registerMaintenance(fastify, maintenance);
  registerGameRoutes(fastify, {
    ...deps,
    isDev,
    maintenance,
    seedKey,
    match,
    clock,
    live: metrics.live,
    views,
    sessionEnds,
    ...loaded,
  });
  const live = registerGateway(fastify, deps.env, metrics, {
    pool: deps.pool,
    engine: match.engine,
    bus: match.bus,
    cookieName: cookie.name,
    sessionEnds,
    views,
    technical: loaded.technical,
  });
  return { fastify, metrics, match, feed, live };
}

// The WebSocket gateway on the same server, closed with it.
// The settings' part: origins, path, the meters, the socket caps and the trusted proxies.
function registerGateway(
  fastify: FastifyInstance,
  env: Env,
  metrics: MetricsHandle,
  deps: Pick<GatewayDeps, 'pool' | 'engine' | 'bus' | 'cookieName' | 'sessionEnds' | 'views'> & {
    readonly technical: LiveTechnical;
  },
): App['live'] {
  // The Technical section's caps (the environment their first default), read on every connect.
  const caps = () => {
    const t = deps.technical();
    return { perAddress: t.socketsPerAddress, perSession: t.socketsPerSession };
  };
  const limits = new SocketLimits(caps, (reason, address, log) => {
    metrics.socketsRefused.inc({ reason });
    if (log) fastify.log.warn({ reason, address }, 'game socket refused');
  });
  const seen = new SeenLive(deps.pool, (message) => {
    fastify.log.warn(message);
  });
  const { io, steps } = attachGateway(fastify.server, {
    ...deps,
    sessionLengths: () => sessionLengthsOf(deps.technical()),
    allowedOrigins: allowedOrigins(env),
    path: `${env.SBR_BASE_PATH}ws`,
    taps: metrics.taps,
    live: metrics.live,
    limits,
    trustedProxies: env.SBR_TRUSTED_PROXIES,
    seen,
  });
  fastify.addHook('onClose', async () => {
    await io.close();
  });
  return { settled: (matchId) => steps.settled(matchId), seenNow: () => seen.flushAll() };
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
