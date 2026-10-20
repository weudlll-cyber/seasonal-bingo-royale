/**
 * @file   apps/server/src/http/routes/quicktest.ts
 * @module server/http
 * @brief  POST /dev/quicktest — in-memory match runner for the player client (WP-08).
 *
 * Responsibility: validate the request body with zod, call the dev-only match runner,
 *                 return the full result as JSON. The route is only mounted when
 *                 NODE_ENV !== 'production' so it is unavailable in a shipped build.
 * Depends on:     fastify, zod, @sbr/contracts, ../../dev/quicktest
 * Used by:        ../app.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/01-game-design.md §6
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { REALTIME_DRAW_INTERVAL_MS } from '@sbr/contracts';

import { runQuickTest } from '../../dev/quicktest.js';

const bodySchema = z.object({
  gameType: z.enum(['royale', 'classicSeasons', 'classic']),
  // Up to 199 bots so a 200-player royale with one owner card still fits (01 §7.6).
  playerCount: z.number().int().min(3).max(199),
  ownerCards: z.number().int().min(1).max(4),
  seedText: z.string().min(1).max(64),
  tickedPrizes: z
    .array(z.string().min(1))
    .refine((list) => new Set(list).size === list.length, { error: 'duplicate prize key' }),
  markingMode: z.enum(['auto', 'manual']),
  // Missed-number rule for the owner's tapping cards (01 §6); the runner raises a delay
  // below the speed window to the speed window.
  missedNumbers: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('autoMarkAfter'), delayMs: z.number().int().min(0).max(60_000) }),
      z.object({ kind: z.literal('noAutoMark') }),
    ])
    .optional(),
  drawIntervalMs: z
    .number()
    .int()
    .min(REALTIME_DRAW_INTERVAL_MS.min)
    .max(REALTIME_DRAW_INTERVAL_MS.max)
    .optional(),
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
