/**
 * @file   apps/server/src/http/routes/leaderboards.ts
 * @module server/http
 * @brief  GET /api/v1/leaderboards, /leaderboards/:periodId and /leaderboards/:periodId/me (05 §2.4).
 *
 * Responsibility: the periods for anyone; a period's ranked rows for anyone, 50 a page with an
 *                 opaque cursor (05 §1), the signed-in caller's row marked; the caller's row
 *                 with five rows on either side (sign-in required, 401 SIGN_IN_REQUIRED). An
 *                 unknown or malformed period id is 404 NOT_FOUND, a malformed cursor 400
 *                 VALIDATION_FAILED. Reads only: league entries are written by the match
 *                 projection alone (03 §11).
 * Depends on:     fastify, @sbr/contracts (types), ../../db/pool, ../../leaderboard/boards
 * Used by:        ../app
 * Spec:           docs/spec/05-api-design.md §1, §2.4; docs/spec/03-security-architecture.md §11
 */
import type { LeaderboardAround, LeaderboardPage, LeaderboardPeriods } from '@sbr/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { DbPool } from '../../db/pool.js';
import { boardAround, boardPage, findPeriod, listPeriods } from '../../leaderboard/boards.js';

const PAGE = 50;
const AROUND = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PeriodRequest = FastifyRequest<{
  Params: { periodId: string };
  Querystring: { cursor?: string };
}>;

export function registerLeaderboardRoutes(app: FastifyInstance, deps: { pool: DbPool }): void {
  app.get('/api/v1/leaderboards', async (): Promise<LeaderboardPeriods> => {
    return { items: await listPeriods(deps.pool) };
  });
  app.get('/api/v1/leaderboards/:periodId', async (request: PeriodRequest, reply) =>
    page(request, reply, deps.pool),
  );
  app.get('/api/v1/leaderboards/:periodId/me', async (request: PeriodRequest, reply) => {
    const accountId = request.session?.accountId ?? null;
    if (accountId === null) return reply.status(401).send({ code: 'SIGN_IN_REQUIRED' });
    const period = await periodOf(deps.pool, request.params.periodId);
    if (period === null) return notFound(reply);
    const items = await boardAround(deps.pool, { periodId: period.id, accountId, around: AROUND });
    return { period, items } satisfies LeaderboardAround;
  });
}

async function page(request: PeriodRequest, reply: FastifyReply, pool: DbPool) {
  const period = await periodOf(pool, request.params.periodId);
  if (period === null) return notFound(reply);
  const offset = offsetOf(request.query.cursor);
  if (offset === null) return reply.status(400).send({ code: 'VALIDATION_FAILED' });
  const { rows, more } = await boardPage(pool, {
    periodId: period.id,
    accountId: request.session?.accountId ?? null,
    offset,
    limit: PAGE,
  });
  const answer: LeaderboardPage = {
    period,
    items: rows,
    nextCursor: more ? cursorOf(offset + PAGE) : null,
  };
  return answer;
}

const periodOf = async (pool: DbPool, id: string) => (UUID.test(id) ? findPeriod(pool, id) : null);

const notFound = (reply: FastifyReply) => reply.status(404).send({ code: 'NOT_FOUND' });

// The cursor is opaque to clients: the offset of the next page, base64url-encoded.
const cursorOf = (offset: number): string =>
  Buffer.from(`o:${String(offset)}`).toString('base64url');

function offsetOf(cursor: string | undefined): number | null {
  if (cursor === undefined) return 0;
  const m = /^o:(\d{1,9})$/.exec(Buffer.from(cursor, 'base64url').toString());
  return m === null ? null : Number(m[1]);
}
