/**
 * @file   apps/server/src/http/routes/health.ts
 * @module server/http
 * @brief  Liveness and readiness endpoints.
 *
 * Responsibility: /healthz answers 200 as long as the process is alive; /readyz
 *                 answers 200 only when the database responds inside a short timeout
 *                 (05 §2.5). Both are unauthenticated, limited per address and return
 *                 minimal bodies.
 * Depends on:     fastify, ../../auth/rateLimit, ../../db/pool
 * Used by:        ../app.ts
 * Spec:           docs/spec/05-api-design.md §2.5, docs/spec/08-devops-architecture.md §4
 */
import type { FastifyInstance } from 'fastify';

import { openRouteLimit } from '../../auth/rateLimit.js';
import { pingDatabase, type DbPool } from '../../db/pool.js';

const READY_TIMEOUT_MS = 1_500;

export function registerHealth(app: FastifyInstance, pool: DbPool): void {
  // Limited per address (03 §13): /readyz asks the database.
  app.get('/healthz', { config: openRouteLimit() }, () => ({ status: 'ok' }));

  app.get('/readyz', { config: openRouteLimit() }, async (_request, reply) => {
    try {
      await Promise.race([pingDatabase(pool), timeoutRejection(READY_TIMEOUT_MS)]);
      return { status: 'ready' };
    } catch (error) {
      app.log.warn({ err: error }, 'readyz: database probe failed');
      return reply.status(503).send({ status: 'unavailable', reason: 'database' });
    }
  });
}

function timeoutRejection(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error(`readyz probe timed out after ${String(ms)}ms`));
    }, ms).unref();
  });
}
