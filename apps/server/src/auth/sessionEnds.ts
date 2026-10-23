/**
 * @file   apps/server/src/auth/sessionEnds.ts
 * @module server/auth
 * @brief  Tells the realtime gateway which sessions just ended, so their sockets close (audit S4).
 *
 * Responsibility: the auth routes report sessions that end (logout, sign-in rotating the old
 *                 session, account deletion); the gateway listens and disconnects every
 *                 socket of those sessions (room `session:<id>`).
 * Depends on:     nothing
 * Used by:        ../http/app, ../http/routes/auth, ../http/routes/devSignIn, ../realtime/gateway
 * Spec:           docs/spec/06-realtime-architecture.md §2.3; docs/spec/03-security-architecture.md §3
 */

type SessionEndsListener = (sessionIds: readonly string[]) => void;

export class SessionEnds {
  private readonly listeners: SessionEndsListener[] = [];

  onEnd(listener: SessionEndsListener): void {
    this.listeners.push(listener);
  }

  end(sessionIds: readonly string[]): void {
    if (sessionIds.length === 0) return;
    for (const listener of this.listeners) listener(sessionIds);
  }
}
