/**
 * @file   apps/server/test/adminTechnical.integration.test.ts
 * @module server/test
 * @brief  The Technical section: owner only, second step before a change, applies at once (piece 7).
 *
 * Responsibility: in a standalone install the owner (`dev-owner`, super_admin) reads the
 *                 Technical values with their hard limits, an Admin (game_admin) may neither
 *                 read nor change them; a lower "Sign-in tries per address" refuses the next
 *                 try at once (no restart) and a shorter player session makes the next guest
 *                 session end sooner; the change is audited. A change needs a second step
 *                 passed in the last 10 minutes (403 STEP_UP_REQUIRED after that); the step-up
 *                 refuses a wrong answer. Values outside their limits are refused. The guest
 *                 sessions it makes are removed.
 * Depends on:     vitest, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §4 (Technical), §7, §8 (c), (f), §9 piece 7
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  removeGuests,
  startHarness,
  stopHarness,
  SUITE_TIMEOUT_MS,
  type Harness,
} from './harness.js';
import { signIn, type Client } from './session.js';

let h: Harness;
let owner: Client;
let admin: Client;

beforeAll(async () => {
  h = await startHarness();
  owner = await signIn(h.built.fastify, 'owner');
  admin = await signIn(h.built.fastify, 'admin');
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await removeGuests(h);
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

const PATH = '/api/v1/admin/technical';

const login = (n: number) =>
  h.built.fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: `nobody-${String(n)}@example.com`, password: 'wrong password here' },
  });

describe('the Technical section (admin-area §8 (c), (f))', () => {
  it('is the owner’s: its values with hard limits; an Admin is refused', async () => {
    const r = await owner.get(PATH);
    expect(r.statusCode).toBe(200);
    const { fields } = r.json<{ fields: { path: string; value: number; max?: number }[] }>();
    expect(fields.find((f) => f.path === 'loginIp')).toMatchObject({ value: 20, max: 500 });
    expect((await admin.get(PATH)).statusCode).toBe(403);
    expect((await admin.post(PATH, { values: { loginIp: 6 } })).statusCode).toBe(403);
  });

  it('applies a lower sign-in limit at once, audited', async () => {
    expect(
      (await owner.post(PATH, { values: { loginIp: 5 }, comment: 'Tighter' })).statusCode,
    ).toBe(200);
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) codes.push((await login(i)).statusCode);
    expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
    expect(codes[5]).toBe(429);
    const audit = await h.pool.query<{ target_id: string }>(
      "SELECT target_id FROM sbr.audit_log WHERE target_id LIKE 'technical@%' ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows[0]?.target_id).toBe('technical@2');
  });

  it('makes the next session as long as the section says', async () => {
    await owner.post(PATH, { values: { playerAbsoluteDays: 3 } });
    await h.built.fastify.inject({ method: 'POST', url: '/api/v1/auth/guest', payload: {} });
    const r = await h.pool.query<{ days: number }>(
      `SELECT round(extract(epoch FROM expires_at - created_at) / 86400)::int AS days
         FROM sbr.sessions WHERE kind = 'guest' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(r.rows[0]?.days).toBe(3);
  });

  it('refuses values outside their limits', async () => {
    expect((await owner.post(PATH, { values: { loginIp: 1 } })).statusCode).toBe(400);
    expect((await owner.post(PATH, { values: { adminIdleMinutes: 1_000 } })).statusCode).toBe(400);
  });

  it('asks for the second step again after 10 minutes, and refuses a wrong code', async () => {
    await h.pool.query(
      `UPDATE sbr.sessions SET last_2fa_at = now() - interval '11 minutes'
        WHERE account_id = (SELECT id FROM sbr.accounts WHERE display_name = 'dev-owner')`,
    );
    const r = await owner.post(PATH, { values: { loginIp: 30 } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ code: 'STEP_UP_REQUIRED' });
    const step = await owner.post('/api/v1/auth/2fa/step-up', { code: '000000' });
    expect(step.statusCode).toBe(400);
  });
});
