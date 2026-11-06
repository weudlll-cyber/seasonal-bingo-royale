/**
 * @file   apps/server/test/socketLimits.integration.test.ts
 * @module server/test
 * @brief  Game sockets: a foreign origin refused at the handshake, caps per session and address (S4).
 *
 * Responsibility: against a listening server with low caps (3 per address, 2 per session): a
 *                 foreign Origin is refused before the namespace and counted; a session's third
 *                 socket is refused, and one closing lets the next in; a fourth session from
 *                 the same address is refused; the load check's account (`match.loadcheck`)
 *                 is not counted per address; every refusal shows in sbr_ws_refused_total. Its
 *                 accounts are removed.
 * Depends on:     vitest, ../src/auth/accounts, ../src/auth/sessions, ./socketKit, ./harness
 * Spec:           docs/spec/06-realtime-architecture.md §8; docs/spec/03-security-architecture.md §13
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { createSession } from '../src/auth/sessions.js';
import { SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

let kit: SocketKit;
const made: string[] = [];

beforeAll(async () => {
  kit = await startSocketKit({ SBR_SOCKETS_PER_ADDRESS: '3', SBR_SOCKETS_PER_SESSION: '2' });
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const id of made) await deleteAccount(kit.harness.pool, id);
  await kit.close();
}, SUITE_TIMEOUT_MS);

// A cookie of a new account's session (roles optional).
async function cookieOf(name: string, roles?: string[]): Promise<string> {
  const r = await registerAccount(kit.harness.pool, {
    email: `${name}@example.com`,
    displayName: name,
    password: 'correct horse battery staple',
    ...(roles === undefined ? {} : { roles }),
  });
  if (!r.ok) throw new Error('registration failed');
  made.push(r.id);
  const { token } = await createSession(kit.harness.pool, r.id, null);
  return `sbr_session=${token}`;
}

const refusals = async (reason: string): Promise<number> => {
  const text = await kit.harness.built.metrics.registry.metrics();
  const line = text
    .split('\n')
    .find((l) => l.startsWith(`sbr_ws_refused_total{reason="${reason}"}`));
  return Number(line?.split(' ')[1] ?? 0);
};

describe('game socket limits (audit-3 S4)', () => {
  it('refuses a foreign origin at the handshake and counts it', async () => {
    const before = await refusals('origin');
    expect(
      await kit.connected(kit.open(await cookieOf('origin1'), 'https://evil.example')),
    ).not.toBe('ok');
    expect(await refusals('origin')).toBe(before + 1);
  });

  it('caps the sockets of one session, and frees a place when one closes', async () => {
    const cookie = await cookieOf('session1');
    const first = kit.open(cookie);
    expect(await kit.connected(first)).toBe('ok');
    expect(await kit.connected(kit.open(cookie))).toBe('ok');
    expect(await kit.connected(kit.open(cookie))).toBe('TOO_MANY_SOCKETS');
    expect(await refusals('session')).toBe(1);
    first.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await kit.connected(kit.open(cookie))).toBe('ok');
  });

  it('caps the sockets of one address, but not the load check account', async () => {
    // The session test above holds 2 of the 3 places of this address.
    expect(await kit.connected(kit.open(await cookieOf('address1')))).toBe('ok');
    expect(await kit.connected(kit.open(await cookieOf('address2')))).toBe('TOO_MANY_SOCKETS');
    expect(await refusals('address')).toBe(1);
    expect(await kit.connected(kit.open(await cookieOf('loadcheck1', ['load_check'])))).toBe('ok');
  });
});
