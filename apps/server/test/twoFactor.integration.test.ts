/**
 * @file   apps/server/test/twoFactor.integration.test.ts
 * @module server/test
 * @brief  Admin two-factor sign-in in a standalone install (TOTP, D60).
 *
 * Responsibility: a local admin's session has no rights until its second step: the first
 *                 sign-in enrols (QR code and link; the first code makes it live and returns ten
 *                 recovery codes), later sign-ins ask for a code (never the same step twice) or
 *                 a recovery code (each once); wrong answers are limited per session; `reset-2fa`
 *                 (../src/auth/twoFactor resetTwoFactor) ends the sessions and brings the
 *                 enrolment back. A player is never asked. Its accounts are removed.
 * Depends on:     vitest, ../src/auth/*, ./harness
 * Spec:           docs/spec/03-security-architecture.md §1, §13
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { codeAt, stepAt } from '../src/auth/totp.js';
import { resetTwoFactor } from '../src/auth/twoFactor.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';

let harness: Harness;
const made: string[] = [];
const PASSWORD = 'correct horse battery staple';
const EMAIL = 'boss@example.com';

beforeAll(async () => {
  harness = await startHarness();
  const r = await registerAccount(harness.pool, {
    email: EMAIL,
    displayName: 'boss',
    password: PASSWORD,
    roles: ['super_admin'],
  });
  if (!r.ok) throw new Error('registration failed');
  made.push(r.id);
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  for (const id of made) await deleteAccount(harness.pool, id);
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

interface Seat {
  readonly cookie: string;
  readonly csrf: string;
}

const inject = (method: 'GET' | 'POST', url: string, seat?: Seat, payload?: object) =>
  harness.built.fastify.inject({
    method,
    url: `/api/v1${url}`,
    headers: seat === undefined ? {} : { cookie: seat.cookie, 'x-csrf-token': seat.csrf },
    ...(payload === undefined ? {} : { payload }),
  });

const summary = async (seat: Seat) =>
  (await inject('GET', '/session', seat)).json<{
    twoFactor: 'enrol' | 'code' | null;
    permissions: string[];
    csrfToken: string;
  }>();

// Each sign-in from its own address: the login limit (5 per account and address) stays out of
// the way.
let signIns = 0;
async function signIn(email = EMAIL): Promise<Seat> {
  signIns += 1;
  const r = await harness.built.fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD },
    remoteAddress: `10.9.0.${String(signIns)}`,
  });
  const c = r.cookies.find((x) => x.name.endsWith('sbr_session'));
  const cookie = c === undefined ? '' : `${c.name}=${c.value}`;
  return { cookie, csrf: (await summary({ cookie, csrf: '' })).csrfToken };
}

// The secret of an otpauth:// link (base32 → bytes).
function secretOf(uri: string): Uint8Array {
  const text = new URL(uri).searchParams.get('secret') ?? '';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

let secret: Uint8Array = new Uint8Array();
let recovery: string[] = [];
const code = (offset = 0) => codeAt(secret, stepAt(Date.now()) + offset);

describe('admin two-factor sign-in (D60)', () => {
  it('enrols at the first sign-in: no rights before, ten recovery codes after the first code', async () => {
    const seat = await signIn();
    const before = await summary(seat);
    expect(before).toMatchObject({ twoFactor: 'enrol', permissions: [] });
    const enrolled = (await inject('POST', '/auth/2fa/enrol', seat)).json<{
      uri: string;
      qrSvg: string;
    }>();
    expect(enrolled.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(enrolled.qrSvg).toContain('<svg');
    secret = secretOf(enrolled.uri);
    expect((await inject('POST', '/auth/2fa/confirm', seat, { code: '000000' })).statusCode).toBe(
      400,
    );
    const confirmed = await inject('POST', '/auth/2fa/confirm', seat, { code: code() });
    recovery = confirmed.json<{ recoveryCodes: string[] }>().recoveryCodes;
    expect(recovery).toHaveLength(10);
    const after = await summary(seat);
    expect(after.twoFactor).toBeNull();
    expect(after.permissions).toContain('match.abort');
  });

  it('asks later sign-ins for a code, never the same step twice', async () => {
    const seat = await signIn();
    expect((await summary(seat)).twoFactor).toBe('code');
    const next = code(1);
    expect((await inject('POST', '/auth/2fa/verify', seat, { code: next })).statusCode).toBe(204);
    expect((await summary(seat)).twoFactor).toBeNull();
    const again = await signIn();
    expect((await inject('POST', '/auth/2fa/verify', again, { code: next })).statusCode).toBe(400);
  });

  it('takes a recovery code once', async () => {
    const first = await signIn();
    const used = recovery[0] ?? '';
    expect(
      (await inject('POST', '/auth/2fa/verify', first, { recoveryCode: used })).statusCode,
    ).toBe(204);
    const second = await signIn();
    expect(
      (await inject('POST', '/auth/2fa/verify', second, { recoveryCode: used })).statusCode,
    ).toBe(400);
  });

  it('limits wrong answers per session', async () => {
    const seat = await signIn();
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1)
      codes.push((await inject('POST', '/auth/2fa/verify', seat, { code: '000000' })).statusCode);
    expect(codes).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it('enrols again after reset-2fa, which ends the sessions', async () => {
    const seat = await signIn();
    expect(await resetTwoFactor(harness.pool, 'boss')).toBe(true);
    expect((await summary(seat)).csrfToken).toBeNull();
    expect((await summary(await signIn())).twoFactor).toBe('enrol');
  });
});
