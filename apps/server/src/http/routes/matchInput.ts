/**
 * @file   apps/server/src/http/routes/matchInput.ts
 * @module server/http
 * @brief  Request bodies of the match routes and the HTTP answer to an engine error.
 *
 * Responsibility: the zod schema of POST /matches (05 §2.3, 11 §3.2: title, game type,
 *                 prizes, draw mode and seconds, missed numbers, leaderboard switch, max
 *                 players, pause between royale rounds, and in development the fast test
 *                 profile), its mapping to the engine's CreateMatchInput, and the status
 *                 code for each MatchError (404 unknown match, 409 wrong phase, 503 maintenance, 422 the rest).
 * Depends on:     fastify, zod, @sbr/application
 * Used by:        ./matches, ./matchHost
 * Spec:           docs/spec/05-api-design.md §2.3, §5; docs/spec/11-admin-panel.md §3.2
 */
import { MatchError, MatchNotFound, type CreateMatchInput } from '@sbr/application';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { fastRuleset } from '../../dev/fastRulesets.js';

export const createBody = z.object({
  title: z.string().trim().min(1).max(60),
  gameType: z.enum(['royale', 'classicSeasons', 'classic']),
  prizes: z.array(z.string().min(1)).max(20).optional(),
  drawMode: z.enum(['auto', 'host']),
  drawIntervalMs: z.number().int().min(1).max(3_600_000).optional(),
  missedNumbers: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('autoMarkAfter'), delayMs: z.number().int().min(0).max(60_000) }),
    z.object({ kind: z.literal('noAutoMark') }),
  ]),
  countsForLeaderboard: z.boolean().optional(),
  maxPlayers: z.number().int().min(2).max(200),
  // The pause between royale rounds (D14); the engine keeps a wait at its minimum.
  roundPause: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('wait'), ms: z.number().int().min(0).max(120_000) }),
      z.object({ kind: z.literal('host') }),
    ])
    .optional(),
  // How the match starts (01 §7.6): the host's Start (default), a set time, when full.
  startRule: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('host') }),
      // A set time is announced; `auto` starts the match itself then (D16, default off).
      z.object({ kind: z.literal('at'), at: z.number().int(), auto: z.boolean().default(false) }),
      z.object({ kind: z.literal('whenFull') }),
    ])
    .optional(),
  // Development only (the route refuses it otherwise): the fast test profile (../../dev).
  testProfile: z.literal('fast').optional(),
});

export function toCreateInput(body: z.infer<typeof createBody>): CreateMatchInput {
  const { testProfile, ...input } = body;
  const fast = testProfile === 'fast' ? fastRuleset(body.gameType) : null;
  return fast === null ? input : { ...input, ruleset: fast };
}

const CONFLICT = new Set([
  'MATCH_NOT_IN_LOBBY',
  'MATCH_FULL',
  'DRAW_MODE_AUTO',
  'DRAW_NOT_ALLOWED',
  'DRAW_TOO_EARLY',
  'NOT_WAITING_FOR_HOST',
  'NO_START_TIME',
]);
// START_TIME_INVALID (a set time too soon or more than a week ahead) answers 422.

export function sendEngineError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
  if (error instanceof MatchNotFound) return reply.status(404).send({ code: 'NOT_FOUND' });
  if (error instanceof MatchError) {
    // `sbr maintenance on`: try again later.
    if (error.code === 'MAINTENANCE') return reply.status(503).send({ code: error.code });
    return reply.status(CONFLICT.has(error.code) ? 409 : 422).send({ code: error.code });
  }
  throw error;
}
