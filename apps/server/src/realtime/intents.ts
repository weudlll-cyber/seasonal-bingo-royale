/**
 * @file   apps/server/src/realtime/intents.ts
 * @module server/realtime
 * @brief  Client → server intents of the gateway with replay protection and limits (06 §4.1).
 *
 * Responsibility: every intent is `{ t, seq, data }` with an acknowledgement `{ ok, data }`
 *                 or `{ ok: false, code }`. `seq` must grow strictly per socket; duplicates
 *                 and out-of-order intents are dropped (`REPLAYED`). Limits per socket: 10
 *                 intents a second overall, marks 4 a second, draw.next 2 a second (03 §13).
 *                 Intents: match.watch / match.unwatch (at most 3 match rooms), mark (players,
 *                 manual marking), draw.next, round.next (D14) and draw.setMode (the
 *                 match's creator with match.manage, D8).
 * Depends on:     zod, socket.io (types), @sbr/application, ../auth/rateLimit, ./gateway (types)
 * Used by:        ./gateway
 * Spec:           docs/spec/06-realtime-architecture.md §4.1, §8; docs/spec/03-security-architecture.md §13
 */
import { MatchError, MatchNotFound } from '@sbr/application';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import { RateLimiter } from '../auth/rateLimit.js';
import type { GatewayDeps, SocketData } from './gateway.js';

export interface IntentContext {
  readonly socket: Socket;
  readonly data: SocketData;
  readonly deps: GatewayDeps;
}

type Answer =
  { readonly ok: true; readonly data?: unknown } | { readonly ok: false; readonly code: string };

const envelope = z.object({
  t: z.string(),
  seq: z.number().int().nonnegative(),
  data: z.unknown(),
});
const codeData = z.object({ code: z.string().min(1).max(16) });
const markData = codeData.extend({
  cardIndex: z.number().int().min(0).max(3),
  cell: z.number().int().min(0).max(24),
});
const modeData = codeData.extend({
  mode: z.enum(['auto', 'host']),
  intervalMs: z.number().int().min(1).max(3_600_000).optional(),
});

const MAX_ROOMS = 3;
const limits = new WeakMap<Socket, { all: RateLimiter; mark: RateLimiter; draw: RateLimiter }>();

function limiterFor(socket: Socket) {
  let l = limits.get(socket);
  if (l === undefined) {
    l = {
      all: new RateLimiter({ limit: 10, windowMs: 1_000 }),
      mark: new RateLimiter({ limit: 4, windowMs: 1_000 }),
      draw: new RateLimiter({ limit: 2, windowMs: 1_000 }),
    };
    limits.set(socket, l);
  }
  return l;
}

export async function handleIntent(ctx: IntentContext, raw: unknown): Promise<Answer> {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED' };
  const { t, seq, data } = parsed.data;
  if (seq <= ctx.data.lastSeq) return { ok: false, code: 'REPLAYED' };
  ctx.data.lastSeq = seq;
  const l = limiterFor(ctx.socket);
  const special = t === 'mark' ? l.mark : t === 'draw.next' ? l.draw : null;
  if (!l.all.take('x').allowed || (special !== null && !special.take('x').allowed)) {
    return { ok: false, code: 'RATE_LIMITED' };
  }
  try {
    return await dispatch(ctx, t, data);
  } catch (error) {
    if (error instanceof MatchNotFound) return { ok: false, code: 'NOT_FOUND' };
    if (error instanceof MatchError) return { ok: false, code: error.code };
    if (error instanceof z.ZodError) return { ok: false, code: 'VALIDATION_FAILED' };
    throw error;
  }
}

async function dispatch(ctx: IntentContext, t: string, data: unknown): Promise<Answer> {
  switch (t) {
    case 'match.watch':
      return watch(ctx, codeData.parse(data).code);
    case 'match.unwatch': {
      const id = await matchId(ctx, codeData.parse(data).code);
      await ctx.socket.leave(`match:${id}`);
      ctx.data.rooms.delete(id);
      return { ok: true };
    }
    case 'mark':
      return mark(ctx, markData.parse(data));
    case 'draw.next': {
      const id = await hostedMatch(ctx, codeData.parse(data).code);
      await ctx.deps.engine.drawNext(id);
      return { ok: true };
    }
    case 'round.next': {
      const id = await hostedMatch(ctx, codeData.parse(data).code);
      await ctx.deps.engine.startNextRound(id);
      return { ok: true };
    }
    case 'draw.setMode': {
      const body = modeData.parse(data);
      const id = await hostedMatch(ctx, body.code);
      const record = await ctx.deps.engine.setDrawControl(id, body.mode, body.intervalMs);
      return { ok: true, data: { settings: record.settings } };
    }
    default:
      return { ok: false, code: 'UNKNOWN_INTENT' };
  }
}

async function matchId(ctx: IntentContext, code: string): Promise<string> {
  const r = await ctx.deps.pool.query<{ id: string }>(
    'SELECT id FROM sbr.matches WHERE code = $1',
    [code],
  );
  const id = r.rows[0]?.id;
  if (id === undefined) throw new MatchNotFound(code);
  return id;
}

function allowed(ctx: IntentContext, permission: string): void {
  if (!ctx.data.session.permissions.includes(permission)) throw new MatchError('FORBIDDEN');
}

async function watch(ctx: IntentContext, code: string): Promise<Answer> {
  allowed(ctx, 'match.watch');
  const id = await matchId(ctx, code);
  if (!ctx.data.rooms.has(id) && ctx.data.rooms.size >= MAX_ROOMS)
    return { ok: false, code: 'TOO_MANY_ROOMS' };
  await ctx.socket.join(`match:${id}`);
  ctx.data.rooms.add(id);
  const m = await ctx.deps.engine.runner.current(id);
  return { ok: true, data: { seq: m.seq } };
}

async function mark(ctx: IntentContext, body: z.infer<typeof markData>): Promise<Answer> {
  allowed(ctx, 'match.join');
  const accountId = ctx.data.session.accountId;
  if (accountId === null) return { ok: false, code: 'FORBIDDEN' };
  const id = await matchId(ctx, body.code);
  const ok = await ctx.deps.engine.mark(id, accountId, body.cardIndex, body.cell);
  return ok ? { ok: true } : { ok: false, code: 'MARK_REJECTED' };
}

async function hostedMatch(ctx: IntentContext, code: string): Promise<string> {
  allowed(ctx, 'match.manage');
  const id = await matchId(ctx, code);
  const m = await ctx.deps.engine.runner.current(id);
  if (m.record.createdBy !== ctx.data.session.accountId) throw new MatchError('NOT_YOUR_MATCH');
  return id;
}
