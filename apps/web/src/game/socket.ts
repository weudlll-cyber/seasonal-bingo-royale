/**
 * @file   apps/web/src/game/socket.ts
 * @module web/game
 * @brief  The client's one WebSocket to the gateway, and intents with acknowledgement (06 §4).
 *
 * Responsibility: open `/play` on `/ws` (WebSocket only, through the dev server's proxy, so
 *                 the session cookie goes along) once per page; send intents as `{ t, seq,
 *                 data }` with a strictly growing seq and wait for the answer (06 §4.1).
 * Depends on:     socket.io-client
 * Used by:        ./useLiveMatch, ./LiveCard, ../host/*
 * Spec:           docs/spec/06-realtime-architecture.md §1, §4
 */
import { io, type Socket } from 'socket.io-client';

export type IntentAnswer =
  { readonly ok: true; readonly data?: unknown } | { readonly ok: false; readonly code: string };

let socket: Socket | null = null;
let seq = 0;

export function gameSocket(): Socket {
  socket ??= io('/play', { path: '/ws', transports: ['websocket'] });
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
    return (await gameSocket()
      .timeout(5_000)
      .emitWithAck('intent', { t, seq, data })) as IntentAnswer;
  } catch {
    return { ok: false, code: 'NO_ANSWER' };
  }
}
