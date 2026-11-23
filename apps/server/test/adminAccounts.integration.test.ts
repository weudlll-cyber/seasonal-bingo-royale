/**
 * @file   apps/server/test/adminAccounts.integration.test.ts
 * @module server/test
 * @brief  Players and accounts: find, Organizer and Admin, lock, second step, sessions (piece 8).
 *
 * Responsibility: the owner alone sees e-mail addresses, finds by them, and resets a second step
 *                 (2026-11-21); an Admin finds an account by the start of its name and makes it an
 *                 Organizer (its session lives on, with the new permission); only the owner makes
 *                 it an Admin, which ends its sessions (the next sign-in asks for the second step);
 *                 locking ends sessions and refuses sign-in, unlocking lets it in; ending sessions
 *                 and resetting the second step work and every change is audited. Refused: one's
 *                 own account, an owner's account for an Admin, an unknown account, a change
 *                 without a recent second step, a player. The account it registers is removed.
 * Depends on:     vitest, ../src/auth/accounts, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §6, §7, §9 piece 8
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let h: Harness;
let owner: Client;
let admin: Client;
let player: Client;
let id = '';

const EMAIL = 'managed@example.com';
const PASSWORD = 'correct horse battery staple';

beforeAll(async () => {
  h = await startHarness();
  owner = await signIn(h.built.fastify, 'owner');
  admin = await signIn(h.built.fastify, 'admin');
  player = await signIn(h.built.fastify, 'player-1');
  const r = await registerAccount(h.pool, {
    email: EMAIL,
    displayName: 'managed1',
    password: PASSWORD,
  });
  if (!r.ok) throw new Error('registration failed');
  id = r.id;
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await deleteAccount(h.pool, id);
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

const login = () =>
  h.built.fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: EMAIL, password: PASSWORD },
  });
const liveSessions = async () =>
  (
    await h.pool.query('SELECT 1 FROM sbr.sessions WHERE account_id = $1 AND revoked_at IS NULL', [
      id,
    ])
  ).rowCount;
// Sorted: a new account starts as a player (registration).
const rolesOf = async () =>
  (
    await h.pool.query<{ role_id: string }>(
      'SELECT role_id FROM sbr.role_assignments WHERE account_id = $1 ORDER BY role_id',
      [id],
    )
  ).rows.map((r) => r.role_id);
const path = (what: string) => `/api/v1/admin/accounts/${id}/${what}`;

describe('Players and accounts (admin-area §4)', () => {
  it('shows e-mail addresses to the owner only, and finds by them only for the owner', async () => {
    const forAdmin = await admin.get('/api/v1/admin/accounts?q=manag');
    expect(forAdmin.json<{ accounts: { email: unknown }[] }>().accounts[0]?.email).toBeNull();
    const byEmail = await admin.get('/api/v1/admin/accounts?q=managed%40');
    expect(byEmail.json<{ accounts: unknown[] }>().accounts).toEqual([]);
    const ownerByEmail = await owner.get('/api/v1/admin/accounts?q=managed%40');
    expect(ownerByEmail.json<{ accounts: { id: string }[] }>().accounts[0]?.id).toBe(id);
  });
});

describe('Players and accounts: find and roles (admin-area §4)', () => {
  it('finds an account by the start of its name, with its facts', async () => {
    const r = await owner.get('/api/v1/admin/accounts?q=manag');
    expect(r.json()).toMatchObject({
      accounts: [
        {
          id,
          displayName: 'managed1',
          email: EMAIL,
          roles: ['player'],
          status: 'active',
          secondStep: false,
        },
      ],
    });
    expect((await player.get('/api/v1/admin/accounts?q=manag')).statusCode).toBe(403);
  });

  it('gives the Organizer role at once; only the owner gives Admin, which ends the sessions', async () => {
    expect((await login()).statusCode).toBe(200);
    expect((await admin.post(path('role'), { role: 'organizer', on: true })).statusCode).toBe(204);
    expect(await rolesOf()).toEqual(['organizer', 'player']);
    expect(await liveSessions()).toBe(1);
    expect((await admin.post(path('role'), { role: 'game_admin', on: true })).statusCode).toBe(403);
    expect((await owner.post(path('role'), { role: 'game_admin', on: true })).statusCode).toBe(204);
    expect(await liveSessions()).toBe(0);
    expect((await owner.post(path('role'), { role: 'game_admin', on: false })).statusCode).toBe(
      204,
    );
    expect(await rolesOf()).toEqual(['organizer', 'player']);
  });

  it('locks (sessions ended, sign-in refused) and unlocks, audited', async () => {
    expect((await login()).statusCode).toBe(200);
    expect((await admin.post(path('lock'), { locked: true })).statusCode).toBe(204);
    expect(await liveSessions()).toBe(0);
    expect((await login()).statusCode).not.toBe(200);
    expect((await admin.post(path('lock'), { locked: false })).statusCode).toBe(204);
    expect((await login()).statusCode).toBe(200);
    const audit = await h.pool.query<{ action: string }>(
      `SELECT action FROM sbr.audit_log WHERE target_id = $1 ORDER BY id`,
      [id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      'account.role.give',
      'account.role.give',
      'account.role.remove',
      'account.lock',
      'account.unlock',
    ]);
  });
});

describe('Players and accounts: sessions, second step, refusals (admin-area §7)', () => {
  it('ends the sessions and resets the second step', async () => {
    expect(await liveSessions()).toBe(1);
    expect((await admin.post(path('end-sessions'), {})).statusCode).toBe(204);
    expect(await liveSessions()).toBe(0);
    // The owner's only (2026-11-21).
    expect((await admin.post(path('reset-2fa'), {})).statusCode).toBe(403);
    expect((await owner.post(path('reset-2fa'), {})).statusCode).toBe(204);
  });

  it('refuses the own account, an owner for an Admin, an unknown one and a stale second step', async () => {
    const ownerId = (await owner.get('/api/v1/session')).json<{ account: { id: string } }>().account
      .id;
    const adminId = (await admin.get('/api/v1/session')).json<{ account: { id: string } }>().account
      .id;
    expect(
      (await admin.post(`/api/v1/admin/accounts/${adminId}/end-sessions`, {})).statusCode,
    ).toBe(409);
    expect(
      (await admin.post(`/api/v1/admin/accounts/${ownerId}/lock`, { locked: true })).statusCode,
    ).toBe(403);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect(
      (await admin.post(`/api/v1/admin/accounts/${unknown}/end-sessions`, {})).statusCode,
    ).toBe(404);
    await h.pool.query(
      `UPDATE sbr.sessions SET last_2fa_at = now() - interval '11 minutes' WHERE account_id = $1`,
      [adminId],
    );
    const stale = await admin.post(path('lock'), { locked: true });
    expect(stale.json()).toEqual({ code: 'STEP_UP_REQUIRED' });
  });
});
