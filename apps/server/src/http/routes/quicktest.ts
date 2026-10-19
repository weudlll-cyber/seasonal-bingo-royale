/**
 * @file   apps/server/src/http/routes/quicktest.ts
 * @module server/http
 * @brief  POST /dev/quicktest — in-memory match runner for the player client (WP-08).
 *
 * Responsibility: validate the request body with zod, call the dev-only match runner,
 *                 return the full result as JSON. The route is only mounted when
 *                 NODE_ENV !== 'production' so it is unavailable in a shipped build.
 * Depends on:     fastify, zod, ../../dev/quicktest
 * Used by:        ../app.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { runQuickTest } from '../../dev/quicktest.js';

const bodySchema = z.object({
  gameType: z.enum(['royale', 'classicSeasons', 'classic']),
  playerCount: z.number().int().min(1).max(50),
  seedText: z.string().min(1).max(64),
  tickedPrizes: z
    .array(z.string().min(1))
    .nonempty()
    .refine((list) => new Set(list).size === list.length, { error: 'duplicate prize key' }),
});

export function registerQuickTest(app: FastifyInstance): void {
  app.post('/dev/quicktest', (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'VALIDATION_FAILED',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const result = runQuickTest(parsed.data);
    return reply.send(result);
  });
}
