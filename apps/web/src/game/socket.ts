/**
 * @file   apps/web/src/game/socket.ts
 * @module web/game
 * @brief  The client's one WebSocket to the gateway, and intents with acknowledgement (06 §4).
 *
 * Responsibility: open `/play` on `/ws` under the client's base path (WebSocket only, through the dev server's proxy, so
 *                 the session cookie goes along) once per page; send intents as `{ t, seq,
 *                 data }` with a strictly growing seq and wait for the answer (06 §4.1); an
 *                 UNAUTHORIZED answer reports the ended session (../shell/http).
 * Depends on:     socket.io-client, ../shell/http
 * Used by:        ./useLiveMatch, ./LiveCard, ../host/*, ../shell/session, ../shell/DevTools,
 *                 ../account/AccountPage
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4
 */
import { io, type Socket } from 'socket.io-client';

import { BASE_PATH, reportSessionLost } from '../shell/http.js';

type IntentAnswer =
  { readonly ok: true; readonly data?: unknown } | { readonly ok: false; readonly code: string };

let socket: Socket | null = null;
let seq = 0;

export function gameSocket(): Socket {
  socket ??= io('/play', { path: `${BASE_PATH}ws`, transports: ['websocket'] });
  return socket;
}

// Reconnect with the current cookie (after a sign-in or sign-out changed the session).
export function resetSocket(): void {
  socket?.disconnect();
  socket = null;
}

export async function intent(t: string, data: unknown): Promise<IntentAnswer> {
  seq += 1;
  try {
    const answer = (await gameSocket()
      .timeout(5_000)
      .emitWithAck('intent', { t, seq, data })) as IntentAnswer;
    // The session ended under the socket (the gateway closes it next).
    if (!answer.ok && answer.code === 'UNAUTHORIZED') reportSessionLost();
    return answer;
  } catch {
    return { ok: false, code: 'NO_ANSWER' };
  }
}
