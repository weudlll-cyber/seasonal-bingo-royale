/**
 * @file   apps/server/src/http/app.ts
 * @module server/http
 * @brief  Builds the Fastify instance of the server with every plugin and route wired.
 *
 * Responsibility: wire logging, security headers, problem-details, health, metrics and
 *                 the placeholder page onto a fresh Fastify instance. The caller owns the
 *                 lifecycle (listen, close, pool disposal).
 * Depends on:     fastify, pino, prom-client (indirectly), ../db/pool
 * Used by:        ../main.ts, test/*
 * Spec:           docs/spec/02-software-architecture.md §3, docs/spec/05-api-design.md §1
 */
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import type { Env } from '../config/env.js';
import type { DbPool } from '../db/pool.js';
import { registerProblemDetails } from './plugins/problem.js';
import { registerSecurityHeaders } from './plugins/securityHeaders.js';
import { registerHealth } from './routes/health.js';
import { createMetrics, registerMetrics, type MetricsHandle } from './routes/metrics.js';
import { registerPlaceholder } from './routes/placeholder.js';

export interface AppDeps {
  readonly env: Env;
  readonly pool: DbPool;
}

export interface App {
  readonly fastify: FastifyInstance;
  readonly metrics: MetricsHandle;
}

export async function buildApp(deps: AppDeps): Promise<App> {
  // Fastify builds the pino logger from this options object; passing a pre-made pino
  // instance would widen generics in a way exactOptionalPropertyTypes rejects.
  const loggerOptions: FastifyServerOptions['logger'] =
    deps.env.NODE_ENV === 'test'
      ? false
      : {
          level: deps.env.SBR_LOG_LEVEL,
          ...(deps.env.NODE_ENV === 'production'
            ? {}
            : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
        };
  const fastify = Fastify({
    logger: loggerOptions,
    disableRequestLogging: deps.env.NODE_ENV === 'test',
    trustProxy: false,
  });

  await registerSecurityHeaders(fastify);
  registerProblemDetails(fastify);
  const metrics = createMetrics();
  registerMetrics(fastify, metrics);
  registerHealth(fastify, deps.pool);
  registerPlaceholder(fastify, {
    dev: deps.env.NODE_ENV !== 'production',
    port: deps.env.SBR_PORT,
  });
  return { fastify, metrics };
}
