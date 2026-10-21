/**
 * @file   apps/server/src/realtime/gateway.ts
 * @module server/realtime
 * @brief  Socket.IO gateway: authenticated sockets, match rooms, events out, intents in (06).
 *
 * Responsibility: one endpoint `/ws`, namespace `/play`, WebSocket only (06 §1). The
 *                 handshake checks the Origin against the allowed list and loads the
 *                 session from the cookie (06 §2); without a live session the socket is
 *                 refused. Committed match events go to the room `match:<id>` as one frame
 *                 `{ s, events }` with the public event projection (the seed removed) and
 *                 the names of newly joined players; record changes (status, start time,
 *                 draw control) go out as `match`. Intents arrive on `intent` and are
 *                 handled by ./intents. Payloads are capped at 16 KiB; a dropped connection
 *                 recovers missed frames for 2 minutes, longer gaps resync over HTTP.
 * Depends on:     socket.io, node:http, ../auth/sessions, ../match/*, ./intents, ./inOrder
 * Used by:        ../http/app
 * Spec:           docs/spec/06-realtime-architecture.md §1–§5, §8
 */
import type { Server as HttpServer } from 'node:http';

import type { MatchEngine } from '@sbr/application';
import { Server, type Socket } from 'socket.io';

import { findSession, type Session } from '../auth/sessions.js';
import type { DbPool } from '../db/pool.js';
import { publicEvent } from '../match/codec.js';
import type { LocalEventBus } from '../match/eventBus.js';
import { matchSummary } from '../http/routes/matchViews.js';
import { inOrder } from './inOrder.js';
import { handleIntent, type IntentContext } from './intents.js';

export interface GatewayDeps {
  readonly pool: DbPool;
  readonly engine: MatchEngine;
  readonly bus: LocalEventBus;
  readonly cookieName: string;
  readonly allowedOrigins: readonly string[];
}

export interface SocketData {
  session: Session;
  lastSeq: number;
  rooms: Set<string>;
}

export function attachGateway(server: HttpServer, deps: GatewayDeps): Server {
  const io = new Server(server, {
    path: '/ws',
    transports: ['websocket'],
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });
  const play = io.of('/play');
  play.use((socket, next) => {
    authenticate(socket, deps)
      .then((session) => {
        (socket.data as SocketData) = { session, lastSeq: 0, rooms: new Set() };
        next();
      })
      .catch((error: unknown) => {
        next(error instanceof Error ? error : new Error('UNAUTHORIZED'));
      });
  });
  play.on('connection', (socket) => {
    const ctx: IntentContext = { socket, data: socket.data as SocketData, deps };
    // One intent at a time per socket, in arrival order (./inOrder).
    const handle = inOrder(async (envelope: unknown, ack?: (answer: unknown) => void) => {
      const answer = await handleIntent(ctx, envelope).catch(() => ({
        ok: false,
        code: 'INTERNAL',
      }));
      ack?.(answer);
    });
    socket.on('intent', (envelope: unknown, ack?: (answer: unknown) => void) => {
      void handle(envelope, ack);
    });
  });
  deps.bus.subscribe((matchId, events) => {
    void namesFor(deps.pool, events).then((names) => {
      play.to(`match:${matchId}`).emit('events', {
        s: events.at(-1)?.seq ?? 0,
        events: events.map((e) => ({ s: e.seq, at: e.occurredAt, event: publicEvent(e.event) })),
        names,
      });
    });
  });
  deps.bus.onChanged((record) => {
    void deps.engine.runner.current(record.id).then((m) => {
      play.to(`match:${record.id}`).emit('match', matchSummary(m));
    });
  });
  return io;
}

async function authenticate(socket: Socket, deps: GatewayDeps): Promise<Session> {
  const origin = socket.handshake.headers.origin;
  if (origin === undefined || !deps.allowedOrigins.includes(origin))
    throw new Error('ORIGIN_NOT_ALLOWED');
  const token = cookieValue(socket.handshake.headers.cookie, deps.cookieName);
  const session = token === null ? null : await findSession(deps.pool, token);
  if (session === null) throw new Error('UNAUTHORIZED');
  return session;
}

function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Display names of the players who joined in this batch (bots keep their id).
async function namesFor(
  pool: DbPool,
  events: readonly { readonly event: { readonly type: string } & Partial<{ accountId: string }> }[],
): Promise<Record<string, string>> {
  const ids = events.flatMap((e) =>
    e.event.type === 'playerJoined' && e.event.accountId !== undefined ? [e.event.accountId] : [],
  );
  if (ids.length === 0) return {};
  const r = await pool.query<{ id: string; display_name: string }>(
    'SELECT id::text, display_name FROM sbr.accounts WHERE id::text = ANY($1)',
    [ids],
  );
  const known = new Map(r.rows.map((row) => [row.id, row.display_name]));
  return Object.fromEntries(ids.map((id) => [id, known.get(id) ?? id]));
}
