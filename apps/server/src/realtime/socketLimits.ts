/**
 * @file   apps/server/src/realtime/socketLimits.ts
 * @module server/realtime
 * @brief  Caps on open game sockets per client address and per session (audit-3 S4, 06 §8).
 *
 * Responsibility: count the open sockets per address and per session; `admit` refuses past
 *                 SBR_SOCKETS_PER_ADDRESS (default 50: many players can share one address at an
 *                 event) or SBR_SOCKETS_PER_SESSION (default 5); `release` when a socket closes.
 *                 A session allowed to run the load check (`match.loadcheck`: only the
 *                 operator's temporary accounts) is not counted per address, so `sbr loadcheck`
 *                 can open its 250 sockets from one machine. Each refusal is counted
 *                 (`sbr_ws_refused_total{reason}`) and logged at most once per address a minute.
 * Depends on:     nothing
 * Used by:        ./gateway
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/03-security-architecture.md §13
 */

export type Refusal = 'origin' | 'address' | 'session';

export interface SocketCaps {
  readonly perAddress: number;
  readonly perSession: number;
}

const LOG_EVERY_MS = 60_000;

export class SocketLimits {
  private readonly byAddress = new Map<string, number>();
  private readonly bySession = new Map<string, number>();
  private readonly logged = new Map<string, number>();

  constructor(
    private readonly caps: SocketCaps,
    // Counts the refusal and, at most once per address a minute, logs it.
    private readonly refused: (reason: Refusal, address: string, log: boolean) => void,
  ) {}

  refuse(reason: Refusal, address: string): void {
    const last = this.logged.get(address) ?? 0;
    const log = Date.now() - last >= LOG_EVERY_MS;
    if (log) this.logged.set(address, Date.now());
    this.refused(reason, address, log);
  }

  // Counts the socket in, or names the cap it would break (and counts nothing).
  admit(address: string, sessionId: string, perAddressExempt: boolean): Refusal | null {
    const here = this.byAddress.get(address) ?? 0;
    const mine = this.bySession.get(sessionId) ?? 0;
    const refusal =
      mine >= this.caps.perSession
        ? 'session'
        : !perAddressExempt && here >= this.caps.perAddress
          ? 'address'
          : null;
    if (refusal !== null) {
      this.refuse(refusal, address);
      return refusal;
    }
    this.bySession.set(sessionId, mine + 1);
    if (!perAddressExempt) this.byAddress.set(address, here + 1);
    return null;
  }

  release(address: string, sessionId: string, perAddressExempt: boolean): void {
    decrement(this.bySession, sessionId);
    if (!perAddressExempt) decrement(this.byAddress, address);
  }
}

function decrement(counts: Map<string, number>, key: string): void {
  const left = (counts.get(key) ?? 1) - 1;
  if (left <= 0) counts.delete(key);
  else counts.set(key, left);
}
