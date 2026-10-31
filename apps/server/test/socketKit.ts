/**
 * @file   apps/server/test/socketKit.ts
 * @module server/test
 * @brief  A listening test server with a signed-in host and player, and game sockets to it.
 *
 * Responsibility: start the harness and listen on a free port; sign in the host and
 *                 player-1; open sockets on `/ws`, namespace `/play` (with or without a
 *                 session, from any origin), wait for the handshake, send intents with a
 *                 rising seq, open a match with host or timed draws; close every socket and
 *                 the harness at the end.
 * Depends on:     socket.io-client, ./harness, ./session
 * Used by:        the integration tests in this folder (test helper)
 * Spec:           docs/spec/06-realtime-architecture.md §1–§4
 */
import { io as connect, type Socket } from 'socket.io-client';

import { startHarness, stopHarness, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

export interface IntentAnswer {
  readonly ok: boolean;
  readonly code?: string;
  readonly data?: unknown;
}

export interface SocketKit {
  readonly harness: Harness;
  readonly host: Client;
  readonly player: Client;
  open(cookie: string | null, origin?: string): Socket;
  // 'ok', or the handshake's refusal (e.g. UNAUTHORIZED).
  connected(socket: Socket): Promise<string>;
  send(socket: Socket, t: string, data: unknown, seq?: number): Promise<IntentAnswer>;
  // The next intent seq, for a test that sends one seq twice.
  nextSeq(): number;
  createMatch(drawMode: 'auto' | 'host'): Promise<string>;
  close(): Promise<void>;
}

export async function startSocketKit(): Promise<SocketKit> {
  const harness = await startHarness();
  await harness.built.fastify.listen({ host: '127.0.0.1', port: 0 });
  const address = harness.built.fastify.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const url = `http://127.0.0.1:${String(port)}/play`;
  const host = await signIn(harness.built.fastify, 'host');
  const player = await signIn(harness.built.fastify, 'player-1');
  const sockets: Socket[] = [];
  let seq = 0;
  const nextSeq = (): number => (seq += 1);
  return {
    harness,
    host,
    player,
    open: (cookie, origin = 'http://localhost:5390') => {
      const headers: Record<string, string> = { origin };
      if (cookie !== null) headers['cookie'] = cookie;
      const s = connect(url, {
        path: '/ws',
        transports: ['websocket'],
        extraHeaders: headers,
        reconnection: false,
      });
      sockets.push(s);
      return s;
    },
    connected: (s) =>
      new Promise<string>((resolve) => {
        s.on('connect', () => {
          resolve('ok');
        });
        s.on('connect_error', (e) => {
          resolve(e.message);
        });
      }),
    send: (s, t, data, at = nextSeq()) =>
      s.emitWithAck('intent', { t, seq: at, data }) as Promise<IntentAnswer>,
    nextSeq,
    createMatch: async (drawMode) => {
      const r = await host.post('/api/v1/matches', {
        title: 'ws',
        gameType: 'classic',
        prizes: ['fullCard'],
        drawMode,
        missedNumbers: { kind: 'noAutoMark' },
        maxPlayers: 10,
      });
      return r.json<{ code: string }>().code;
    },
    close: async () => {
      for (const s of sockets) s.disconnect();
      await stopHarness(harness);
    },
  };
}
