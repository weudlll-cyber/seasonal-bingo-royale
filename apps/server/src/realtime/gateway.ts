/**
 * @file   apps/server/src/realtime/gateway.ts
 * @module server/realtime
 * @brief  Socket.IO gateway: authenticated sockets, match rooms, events out, intents in (06).
 *
 * Responsibility: one endpoint `/ws` (under the base path), namespace `/play`, WebSocket only (06 §1). The
 *                 handshake checks the Origin against the allowed list and loads the
 *                 session from the cookie (06 §2); without a live session the socket is
 *                 refused, also on a recovered connection. Each socket joins the room
 *                 `session:<id>`; when its session ends (logout, account deletion, a new
 *                 sign-in) the socket is closed (../auth/sessionEnds). Committed match events go to the room `match:<id>` as one frame
 *                 `{ s, events }` with the public event projection (the seed removed; a round
 *                 start without cards and draw order, ../view/clientEvents liveEvent) and
 *                 every player renamed as the state endpoint does: names from that match's
 *                 own entries, cached per match for 30 s (../view/playerNames; a screen
 *                 appends such events without fetching); record changes (status, start time,
 *                 draw control) go out as `match`. Intents arrive on `intent` and are
 *                 handled by ./intents; when a host intent finds the session ended since the
 *                 connect, the answer goes out and the socket closes. Payloads are capped at 16 KiB; a dropped connection
 *                 recovers missed frames for 2 minutes, longer gaps resync over HTTP.
 * Depends on:     socket.io, node:http, ../auth/sessions, ../match/*, ../view/clientEvents,
 *                 ../view/playerNames, ./intents, ./inOrder, @sbr/application, ../auth/sessionEnds,
 *                 ../db/pool, ../http/routes/matchViews
 * Used by:        ../http/app, ./intents
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
import { accountIdsIn, liveEvent, renameAccounts } from '../view/clientEvents.js';
import { PlayerNameCache, playerNames } from '../view/playerNames.js';
import type { SessionEnds } from '../auth/sessionEnds.js';
import { inOrder } from './inOrder.js';
import { handleIntent, SESSION_ENDED, type Answer, type IntentContext } from './intents.js';

export interface GatewayDeps {
  readonly pool: DbPool;
  readonly engine: MatchEngine;
  readonly bus: LocalEventBus;
  readonly cookieName: string;
  readonly allowedOrigins: readonly string[];
  // "/ws" standalone, "/games/bingo/ws" behind the website (09 §1).
  readonly path: string;
  // Ended sessions (logout, account deletion, rotation): their sockets are closed.
  readonly sessionEnds: SessionEnds;
}

export interface SocketData {
  session: Session;
  lastSeq: number;
  rooms: Set<string>;
}

export function attachGateway(server: HttpServer, deps: GatewayDeps): Server {
  const io = new Server(server, {
    path: deps.path,
    transports: ['websocket'],
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    // A recovered connection runs the session check again (audit S4).
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: false },
  });
  const play = io.of('/play');
  // Every socket sits in the room of its session; an ended session closes them (06 §2.3).
  deps.sessionEnds.onEnd((ids) => {
    for (const id of ids) play.in(`session:${id}`).disconnectSockets(true);
  });
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
    onConnection(socket, deps);
  });
  // Names from the match's own entries, cached per match for a short while (../view/playerNames).
  const names = new PlayerNameCache((matchId) => playerNames(deps.pool, matchId));
  deps.bus.subscribe((matchId, events) => {
    // Room-wide frames carry no cards and no draw order; screens fetch their own view.
    const plain = events.map((e) => liveEvent(publicEvent(e.event), null));
    void names.namesFor(matchId, accountIdsIn(plain)).then((book) => {
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

// A socket joins its session's room and takes intents one at a time, in arrival order
// (./inOrder).
function onConnection(socket: Socket, deps: GatewayDeps): void {
  const ctx: IntentContext = { socket, data: socket.data as SocketData, deps };
  void socket.join(`session:${ctx.data.session.id}`);
  const handle = inOrder(async (envelope: unknown, ack?: (answer: unknown) => void) => {
    const answer = await handleIntent(ctx, envelope).catch((): Answer => ({
      ok: false,
      code: 'INTERNAL',
    }));
    ack?.(answer);
    // A session that ended since the connect (./intents): the answer goes out, then the
    // socket closes (06 §2.3).
    if (!answer.ok && answer.code === SESSION_ENDED) socket.disconnect(true);
  });
  socket.on('intent', (envelope: unknown, ack?: (answer: unknown) => void) => {
    void handle(envelope, ack);
  });
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
