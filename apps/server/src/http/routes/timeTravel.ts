/**
 * @file   apps/server/src/http/routes/timeTravel.ts
 * @module server/http
 * @brief  Development only: POST /api/v1/dev/time-travel moves one match ahead in time.
 *
 * Responsibility: { code, ms } (up to a week) moves the match's clock ahead and runs the
 *                 actions that come due meanwhile (../../dev/devClock), for the asynchronous
 *                 journey's "a day later" (12 §4, journey 2) and for the owner trying it. Any
 *                 signed-in session (CSRF checked). The app registers this route only with
 *                 SBR_DEV=1; the production bundle replaces the module (build.mjs) and a test
 *                 proves a production build answers 404.
 * Depends on:     fastify, zod, ../../dev/devClock, ../../match/pgScheduler (types), ./matches
 * Used by:        ../app
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/spec/15-implementation-plan.md WP-14
 */
import { matchIdByCode } from '../../match/records.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { travel, type DevClock } from '../../dev/devClock.js';
import type { PgScheduler } from '../../match/pgScheduler.js';
import { type MatchRouteDeps } from './matches.js';

const body = z.object({
  code: z.string().min(1).max(16),
  ms: z
    .number()
    .int()
    .min(1)
    .max(7 * 86_400_000),
});

interface TimeTravelDeps extends Pick<MatchRouteDeps, 'pool' | 'engine'> {
  readonly clock: DevClock;
  readonly scheduler: PgScheduler;
}

export function registerTimeTravel(app: FastifyInstance, deps: TimeTravelDeps): void {
  app.post('/api/v1/dev/time-travel', async (request, reply) => {
    if (request.session?.accountId == null) {
      return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
    }
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
    const id = await matchIdByCode(deps.pool, parsed.data.code);
    if (id === null) return reply.status(404).send({ code: 'NOT_FOUND' });
    return travel(deps, id, parsed.data.ms);
  });
}
