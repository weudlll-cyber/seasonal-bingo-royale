/**
 * @file   apps/server/src/http/routes/health.ts
 * @module server/http
 * @brief  Liveness and readiness endpoints.
 *
 * Responsibility: /healthz answers 200 as long as the process is alive; /readyz
 *                 answers 200 only when the database responds inside a short timeout
 *                 (05 §2.5; the kit's `readiness` and route names, K64). Both are
 *                 unauthenticated, limited per address and return minimal bodies.
 * Depends on:     fastify, @seasonal/kit/server (HEALTH_PATHS, readiness), ../../auth/rateLimit,
 *                 ../../db/pool
 * Used by:        ../app.ts
 * Spec:           docs/spec/05-api-design.md §2.5, docs/spec/08-devops-architecture.md §4
 */
import { HEALTH_PATHS, readiness } from '@seasonal/kit/server';
import type { FastifyInstance } from 'fastify';

import { openRouteLimit } from '../../auth/rateLimit.js';
import { pingDatabase, type DbPool } from '../../db/pool.js';

export function registerHealth(app: FastifyInstance, pool: DbPool): void {
  // Limited per address (03 §13): /readyz asks the database.
  app.get(HEALTH_PATHS.live, { config: openRouteLimit() }, () => ({ status: 'ok' }));

  app.get(HEALTH_PATHS.ready, { config: openRouteLimit() }, async (_request, reply) => {
    // The kit's answer: ready, or unavailable when the probe fails or takes longer than 1.5 s.
    const answer = await readiness(() => pingDatabase(pool));
    if (answer.error !== undefined) {
      app.log.warn({ err: answer.error }, 'readyz: database probe failed');
    }
    return reply.status(answer.code).send(answer.body);
  });
}
