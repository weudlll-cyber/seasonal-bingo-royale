/**
 * @file   apps/server/src/realtime/gateway.ts
 * @module server/realtime
 * @brief  Socket.IO gateway: authenticated sockets, match rooms, events out, intents in (06).
 *
 * Responsibility: one endpoint `/ws`, namespace `/play`, WebSocket only (06 §1). The
 *                 handshake checks the Origin against the allowed list and loads the
 *                 session from the cookie (06 §2); without a live session the socket is
 *                 refused. Committed match events go to the room `match:<id>` as one frame
 *                 `{ s, events }` with the public event projection (the seed removed; a round
 *                 start without cards and draw order, ../view/clientEvents liveEvent) and
 *                 every account renamed to its display name, as the state endpoint does (a
 *                 screen appends such events without fetching); record changes (status, start time,
 *                 draw control) go out as `match`. Intents arrive on `intent` and are
 *                 handled by ./intents. Payloads are capped at 16 KiB; a dropped connection
 *                 recovers missed frames for 2 minutes, longer gaps resync over HTTP.
 * Depends on:     socket.io, node:http, ../auth/sessions, ../match/*, ../view/clientEvents,
 *                 ./intents, ./inOrder
 * Used by:        ../http/app
 * Spec:           docs/spec/06-realtime-architecture.md §1–§5, §8
 */
import type { Server as HttpServer } from 'node:http';

import type { MatchEngine } from '@sbr/application';
import type { DomainEvent } from '@sbr/domain';
import { Server, type Socket } from 'socket.io';

import { findSession, type Session } from '../auth/sessions.js';
import type { DbPool } from '../db/pool.js';
import { publicEvent } from '../match/codec.js';
import type { LocalEventBus } from '../match/eventBus.js';
import { matchSummary } from '../http/routes/matchViews.js';
import { accountIdsIn, liveEvent, renameAccounts } from '../view/clientEvents.js';
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
  const names = nameBook(deps.pool);
  deps.bus.subscribe((matchId, events) => {
    // Room-wide frames carry no cards and no draw order; screens fetch their own view.
    const plain = events.map((e) => liveEvent(publicEvent(e.event), null));
    void names(plain).then((book) => {
      const renamed = renameAccounts(plain, book);
      play.to(`match:${matchId}`).emit('events', {
        s: events.at(-1)?.seq ?? 0,
        events: events.map((e, i) => ({ s: e.seq, at: e.occurredAt, event: renamed[i] })),
      });
    });
  });
  deps.bus.onChanged((record) => {
    void deps.engine.runner.current(record.id).then((m) => {
      play.to(`match:${record.id}`).emit('match', matchSummary(m, null));
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

// Display names for every account the events name, from a cache that only asks the
// database for names it has not seen (bots keep their id). Names are public and the same
// for every viewer, so frames carry events already renamed, as the state endpoint does.
function nameBook(pool: DbPool): (events: readonly DomainEvent[]) => Promise<Map<string, string>> {
  const known = new Map<string, string>();
  return async (events) => {
    const unknown = [...accountIdsIn(events)].filter(
      (id) => !known.has(id) && !id.startsWith('bot-'),
    );
    if (unknown.length > 0) {
      const r = await pool.query<{ id: string; display_name: string }>(
        'SELECT id::text, display_name FROM sbr.accounts WHERE id::text = ANY($1)',
        [unknown],
      );
      for (const row of r.rows) known.set(row.id, row.display_name);
    }
    return known;
  };
}
