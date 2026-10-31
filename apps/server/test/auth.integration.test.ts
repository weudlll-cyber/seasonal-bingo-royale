/**
 * @file   apps/server/test/auth.integration.test.ts
 * @module server/test
 * @brief  Local accounts, sessions, CSRF, auth rate limits, guests and dev sign-in (WP-09).
 *
 * Responsibility: register → session cookie → GET /session; weak passwords and taken
 *                 names refused; login answers alike for a wrong password and an unknown
 *                 e-mail; state-changing calls need the session's CSRF token; logout ends
 *                 the session; login is rate-limited per account+IP; guests get watch-only
 *                 permissions; the dev quick sign-in gives dev-host `match.create` and reuses
 *                 accounts; a production build has no dev sign-in; with e-mail verification
 *                 on, unverified accounts cannot sign in. Each test creates the accounts it
 *                 needs (any order works) and they are removed at the end, the guest
 *                 sessions too.
 * Depends on:     vitest, ./harness, fastify, ../src/auth/accounts
 * Spec:           docs/spec/03-security-architecture.md §2.1, §2.3, §3, §8, §13; docs/spec/05-api-design.md §2.1
 */
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import {
  buildOn,
  guestSessions,
  removeGuests,
  startHarness,
  stopHarness,
  SUITE_TIMEOUT_MS,
  type Harness,
} from './harness.js';

let harness: Harness;
const app = (): FastifyInstance => harness.built.fastify;

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  // Every account a test registered goes again (the dev accounts stay).
  const made = await harness.pool.query<{ id: string }>(
    "SELECT id FROM sbr.accounts WHERE email LIKE '%@example.com'",
  );
  for (const row of made.rows) await deleteAccount(harness.pool, row.id);
  await removeGuests(harness);
  expect(await guestSessions(harness)).toBe(0);
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const COOKIE = 'sbr_session';
const cookieOf = (r: LightMyRequestResponse): string =>
  `${COOKIE}=${r.cookies.find((c) => c.name === COOKIE)?.value ?? ''}`;

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return app().inject({ method: 'POST', url, payload: body as object, headers });
}

async function session(cookie: string) {
  const r = await app().inject({ method: 'GET', url: '/api/v1/session', headers: { cookie } });
  return r.json<{
    signedIn: boolean;
    kind: string | null;
    permissions: string[];
    csrfToken: string | null;
    account: { displayName: string } | null;
  }>();
}

const strong = 'correct horse battery staple';

// An account of this test's own (registered directly, past the per-address limit); its
// e-mail is <name>@example.com.
async function account(name: string): Promise<string> {
  await registerAccount(harness.pool, {
    email: `${name}@example.com`,
    displayName: name,
    password: strong,
  });
  return `${name}@example.com`;
}

describe('local accounts and sessions', () => {
  it('registers, sets the session cookie and reports the session with a CSRF token', async () => {
    const r = await post('/api/v1/auth/register', {
      email: 'ann@example.com',
      displayName: 'ann',
      password: strong,
    });
    expect(r.statusCode).toBe(201);
    const s = await session(cookieOf(r));
    expect(s.signedIn).toBe(true);
    expect(s.account?.displayName).toBe('ann');
    expect(s.permissions).toContain('match.join');
    expect(s.permissions).not.toContain('match.create');
    expect(s.csrfToken).toMatch(/^[\w-]{40,}$/);
  });

  it('refuses weak passwords and a taken e-mail or name with one generic answer', async () => {
    await account('cara');
    const weak = await post('/api/v1/auth/register', {
      email: 'bob@example.com',
      displayName: 'bob',
      password: 'short',
    });
    expect(weak.json()).toMatchObject({ code: 'PASSWORD_WEAK', reason: 'tooShort' });
    const common = await post('/api/v1/auth/register', {
      email: 'bob@example.com',
      displayName: 'bob',
      password: 'password1234',
    });
    expect(common.json()).toMatchObject({ reason: 'tooCommon' });
    const sameMail = await post('/api/v1/auth/register', {
      email: 'CARA@example.com',
      displayName: 'cara2',
      password: strong,
    });
    const sameName = await post('/api/v1/auth/register', {
      email: 'cara2@example.com',
      displayName: 'CARA',
      password: strong,
    });
    expect(sameMail.statusCode).toBe(409);
    expect(sameName.json()).toEqual(sameMail.json());
  });
});

describe('login, CSRF and limits', () => {
  it('answers a wrong password and an unknown e-mail alike', async () => {
    const email = await account('dora');
    const wrong = await post('/api/v1/auth/login', {
      email,
      password: 'not the password',
    });
    const unknown = await post('/api/v1/auth/login', {
      email: 'nobody@example.com',
      password: 'not the password',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
    const ok = await post('/api/v1/auth/login', { email, password: strong });
    expect(ok.statusCode).toBe(200);
  });

  it('requires the CSRF token for logout, then ends the session', async () => {
    const email = await account('erin');
    const login = await post('/api/v1/auth/login', { email, password: strong });
    const cookie = cookieOf(login);
    expect((await post('/api/v1/auth/logout', {}, { cookie })).statusCode).toBe(403);
    const { csrfToken } = await session(cookie);
    const out = await post('/api/v1/auth/logout', {}, { cookie, 'x-csrf-token': csrfToken ?? '' });
    expect(out.statusCode).toBe(204);
    expect((await session(cookie)).signedIn).toBe(false);
  });

  it('accepts session-starting calls only as JSON (no cross-site form posts)', async () => {
    const r = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: 'email=ann%40example.com&password=x',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(r.statusCode).toBe(415);
  });

  it('slows down repeated logins for one account from one address (soft, 03 §13)', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      codes.push(
        (await post('/api/v1/auth/login', { email: 'limit@example.com', password: 'x' }))
          .statusCode,
      );
    }
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});

describe('deleting the own account (DELETE /me)', () => {
  it('needs the password, then removes the account and its session', async () => {
    // From its own address: the suite's earlier registrations count against the limit.
    const r = await app().inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: '10.0.0.77',
      payload: { email: 'gone@example.com', displayName: 'gone', password: strong },
    });
    expect(r.statusCode).toBe(201);
    const cookie = cookieOf(r);
    const { csrfToken } = await session(cookie);
    const del = (password: string) =>
      app().inject({
        method: 'DELETE',
        url: '/api/v1/me',
        payload: { password },
        headers: { cookie, 'x-csrf-token': csrfToken ?? '' },
      });
    const wrong = await del('not the password');
    expect(wrong.body).toBe('{"code":"PASSWORD_REQUIRED"}');
    const ok = await del(strong);
    expect(ok.body).toBe('');
    expect(ok.statusCode).toBe(204);
    expect((await session(cookie)).signedIn).toBe(false);
    const again = await post('/api/v1/auth/login', { email: 'gone@example.com', password: strong });
    expect(again.statusCode).toBe(401);
  });
});

describe('guests and the dev quick sign-in', () => {
  it('gives a guest a watch-only session', async () => {
    const r = await post('/api/v1/auth/guest', {});
    const s = await session(cookieOf(r));
    expect(s.kind).toBe('guest');
    expect(s.signedIn).toBe(false);
    expect(s.permissions).toEqual(['match.watch']);
  });

  it('signs in as dev-host (organizer) and reuses the same account next time', async () => {
    const first = await post('/api/v1/dev/sign-in', { as: 'host' });
    const again = await post('/api/v1/dev/sign-in', { as: 'host' });
    expect(again.json()).toEqual(first.json());
    const s = await session(cookieOf(first));
    expect(s.account?.displayName).toBe('dev-host');
    expect(s.permissions).toEqual(expect.arrayContaining(['match.create', 'match.manage']));
    const player = await session(cookieOf(await post('/api/v1/dev/sign-in', { as: 'player-2' })));
    expect(player.account?.displayName).toBe('dev-player-2');
    expect(player.permissions).not.toContain('match.create');
  });
});

describe('development accounts', () => {
  it('gives the development accounts no password anyone knows (audit S2)', async () => {
    expect((await post('/api/v1/dev/sign-in', { as: 'player-3' })).statusCode).toBe(200);
    const old = { email: 'dev-player-3@dev.invalid', password: 'dev-player-3-dev-only-password' };
    expect(
      (await post('/api/v1/auth/login', old, { 'x-forwarded-for': '10.0.0.88' })).statusCode,
    ).toBe(401);
  });

  it('signs in several browsers as the same new dev account at once (no 500)', async () => {
    const answers = await Promise.all(
      [1, 2, 3].map(() => post('/api/v1/dev/sign-in', { as: 'load-031' })),
    );
    expect(answers.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    await app().inject({ method: 'DELETE', url: '/api/v1/dev/load-accounts' });
  });

  it('signs in numbered load players and removes them all afterwards', async () => {
    const r = await post('/api/v1/dev/sign-in', { as: 'load-007' });
    expect(r.json<{ displayName: string }>().displayName).toBe('dev-load-007');
    const cookie = cookieOf(r);
    expect((await session(cookie)).account?.displayName).toBe('dev-load-007');
    const gone = await app().inject({ method: 'DELETE', url: '/api/v1/dev/load-accounts' });
    expect(gone.json<{ deleted: number }>().deleted).toBe(1);
    expect((await session(cookie)).signedIn).toBe(false);
  });

  it('has no dev sign-in in a production build', async () => {
    const prod = await buildOn(harness.pool, harness.container.getConnectionUri(), {
      NODE_ENV: 'production',
      SBR_DEV: '0',
    });
    const r = await prod.fastify.inject({
      method: 'POST',
      url: '/api/v1/dev/sign-in',
      payload: { as: 'host' },
    });
    expect(r.statusCode).toBe(404);
    await prod.fastify.close();
  });

  it('refuses unverified accounts when e-mail verification is switched on', async () => {
    const email = await account('finn');
    const flagged = await buildOn(harness.pool, harness.container.getConnectionUri(), {
      SBR_FEATURE_EMAIL_VERIFICATION: 'true',
    });
    const r = await flagged.fastify.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: strong },
    });
    expect(r.json()).toEqual({ code: 'EMAIL_NOT_VERIFIED' });
    await flagged.fastify.close();
  });
});
