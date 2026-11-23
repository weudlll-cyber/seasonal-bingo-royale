/**
 * @file   apps/server/test/twoFactor.integration.test.ts
 * @module server/test
 * @brief  Admin two-factor sign-in in a standalone install (TOTP, D60).
 *
 * Responsibility: a local admin's session has no rights until its second step: the first
 *                 sign-in enrols (QR code and link; the first code makes it live and returns ten
 *                 recovery codes), later sign-ins ask for a code (never the same step twice) or
 *                 a recovery code (each once; stored as an HMAC under the install's recovery key,
 *                 K20, and a code stored as the plain SHA-256 of before still works once, K27);
 *                 wrong answers are limited per session; `reset-2fa`
 *                 (../src/auth/twoFactor resetTwoFactor) ends the sessions and brings the
 *                 enrolment back. A player is never asked. Its accounts are removed.
 * Depends on:     vitest, node:crypto, @seasonal/kit/server (hotp, stepAt, base32Decode),
 *                 ../src/auth/*, ./harness
 * Spec:           docs/spec/03-security-architecture.md §1, §13
 */
import { createHash } from 'node:crypto';

import { base32Decode, hotp, stepAt } from '@seasonal/kit/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { recoveryCodeStored, resetTwoFactor } from '../src/auth/twoFactor.js';
import {
  startHarness,
  stopHarness,
  SUITE_TIMEOUT_MS,
  TEST_RECOVERY_KEY,
  type Harness,
} from './harness.js';

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
const secretOf = (uri: string): Uint8Array =>
  base32Decode(new URL(uri).searchParams.get('secret') ?? '') ?? new Uint8Array();

let secret: Uint8Array = new Uint8Array();
let recovery: string[] = [];
const code = (offset = 0) => hotp(secret, stepAt(Date.now()) + offset);

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
});

// After the tests above: `recovery` holds the codes the first sign-in received.
describe("recovery codes under the install's key (K20, K27), then reset-2fa", () => {
  it('stores the recovery codes keyed, never as their plain SHA-256 (K20)', async () => {
    const plain = recovery.map((c) => createHash('sha256').update(c).digest('hex'));
    const stored = await harness.pool.query<{ hash: string }>(
      `SELECT encode(code_hash, 'hex') AS hash FROM sbr.recovery_codes r
         JOIN sbr.accounts a ON a.id = r.account_id WHERE a.display_name_key = 'boss'`,
    );
    expect(stored.rows).toHaveLength(10);
    for (const row of stored.rows) expect(plain).not.toContain(row.hash);
  });

  it('takes a code stored before the change, as its plain SHA-256, once (K27)', async () => {
    const old = '0a1b2c3d4e';
    await harness.pool.query(
      `INSERT INTO sbr.recovery_codes (account_id, code_hash)
         SELECT id, $1 FROM sbr.accounts WHERE display_name_key = 'boss'`,
      [createHash('sha256').update(old).digest()],
    );
    const first = await signIn();
    expect(
      (await inject('POST', '/auth/2fa/verify', first, { recoveryCode: old })).statusCode,
    ).toBe(204);
    const second = await signIn();
    expect(
      (await inject('POST', '/auth/2fa/verify', second, { recoveryCode: old })).statusCode,
    ).toBe(400);
  });

  it('finds an unused stored code under the right key only, without using it (the restore drill)', async () => {
    const key = Buffer.from(TEST_RECOVERY_KEY, 'hex');
    const other = Buffer.from('fedcba9876543210'.repeat(4), 'hex');
    const unused = recovery[1] ?? '';
    expect(await recoveryCodeStored(harness.pool, key, 'boss', unused)).toBe(true);
    // The name as citext, the code in the kit's hex form (case and dashes do not matter).
    expect(await recoveryCodeStored(harness.pool, key, 'BOSS', unused.toUpperCase())).toBe(true);
    expect(await recoveryCodeStored(harness.pool, key, 'boss', recovery[0] ?? '')).toBe(false);
    expect(await recoveryCodeStored(harness.pool, other, 'boss', unused)).toBe(false);
    expect(await recoveryCodeStored(harness.pool, key, 'nobody', unused)).toBe(false);
    // Read only: the code still signs in once.
    const seat = await signIn();
    expect(
      (await inject('POST', '/auth/2fa/verify', seat, { recoveryCode: unused })).statusCode,
    ).toBe(204);
  });

  it('enrols again after reset-2fa, which ends the sessions', async () => {
    const seat = await signIn();
    expect(await resetTwoFactor(harness.pool, 'boss')).toBe(true);
    expect((await summary(seat)).csrfToken).toBeNull();
    expect((await summary(await signIn())).twoFactor).toBe('enrol');
  });
});
