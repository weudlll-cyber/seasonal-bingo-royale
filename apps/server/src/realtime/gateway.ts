/**
 * @file   apps/server/src/realtime/gateway.ts
 * @module server/realtime
 * @brief  Socket.IO gateway: authenticated sockets, match rooms, events out, intents in (06).
 *
 * Responsibility: `/ws` (base path), namespace `/play`, WebSocket only (06 §1). The handshake
 *                 checks Origin, needs a live cookie session (06 §2), also on recovery. Sockets
 *                 join `session:<id>` and close when it ends (../auth/sessionEnds). Committed
 *                 events go out per step (./liveSteps): one room frame to `match:<id>` as `events`
 *                 (public: no seed, round starts without cards or draw order) and one `own`
 *                 frame per socket; record changes as `match`.
 *                 `intent` goes to ./intents; a host intent on an ended session is answered, then
 *                 closed. Payloads max 16 KiB; frames recover for 2 min, then HTTP resync.
 * Depends on:     socket.io, ../auth/sessions, ../match/eventBus (types), ../view/liveViews
 *                 (types), ./intents, ./inOrder, ./liveSteps, @sbr/application,
 *                 ../auth/sessionEnds, ../db/pool, ../http/routes/matchViews,
 *                 ../http/routes/metrics (types), ./matchCodes
 * Used by:        ../http/app, ./intents
 * Spec:           docs/spec/06-realtime-architecture.md §1–§5, §8
 */
import type { Server as HttpServer } from 'node:http';

import type { MatchEngine } from '@sbr/application';
import { Server, type Socket } from 'socket.io';

import { findSession, type Session } from '../auth/sessions.js';
import type { DbPool } from '../db/pool.js';
import type { LocalEventBus } from '../match/eventBus.js';
import { matchSummary } from '../http/routes/matchViews.js';
import type { LiveMetrics, TapMetrics } from '../http/routes/metrics.js';
import type { LiveViews } from '../view/liveViews.js';
import type { SessionEnds } from '../auth/sessionEnds.js';
import { inOrder } from './inOrder.js';
import { LiveSteps, type SocketLive } from './liveSteps.js';
import { MatchCodes } from './matchCodes.js';
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
  // The tap breakdown and the live updates' cost (12 §5); none in tests that do not measure.
  readonly taps?: TapMetrics;
  readonly live?: LiveMetrics;
  // The server's one replay per live match, shared with the state fetches.
  readonly views: LiveViews;
}

export interface SocketData {
  session: Session;
  lastSeq: number;
  rooms: Set<string>;
  // Per watched match: what this socket got of the live frames (./liveSteps).
  live: Map<string, SocketLive>;
}

export function attachGateway(server: HttpServer, deps: GatewayDeps): Server {
  // A match's code never changes: each is looked up once for all sockets (12 §5).
  const codes = new MatchCodes(deps.pool);
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
        (socket.data as SocketData) = { session, lastSeq: 0, rooms: new Set(), live: new Map() };
        next();
      })
      .catch((error: unknown) => {
        next(error instanceof Error ? error : new Error('UNAUTHORIZED'));
      });
  });
  play.on('connection', (socket) => {
    onConnection(socket, deps, codes);
  });
  // One step per burst of events: the room's frame once, then each socket's own.
  const steps = new LiveSteps({ play, engine: deps.engine, views: deps.views, live: deps.live });
  deps.bus.subscribe((matchId, events) => {
    steps.published(matchId, events);
  });
  deps.bus.onChanged((record) => {
    void deps.engine.runner.current(record.id).then((m) => {
      play.to(`match:${record.id}`).emit('match', matchSummary(m, null, deps.engine.clockFacts(m)));
    });
  });
  return io;
}

// A socket joins its session's room and takes intents one at a time, in arrival order
// (./inOrder).
function onConnection(socket: Socket, deps: GatewayDeps, codes: MatchCodes): void {
  const ctx: IntentContext = { socket, data: socket.data as SocketData, deps, codes };
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
