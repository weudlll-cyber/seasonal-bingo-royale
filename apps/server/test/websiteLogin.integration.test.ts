/**
 * @file   apps/server/test/websiteLogin.integration.test.ts
 * @module server/test
 * @brief  Website mode: players sign in only through the website's proxy headers (D37).
 *
 * Responsibility: a server in website mode under /games/bingo/ (production settings, the test
 *                 runner's address as the trusted proxy): GET /games/bingo/auth/website with the
 *                 four headers from the trusted peer creates the account (no password, no
 *                 e-mail), maps "may start games" to hosting, mirrors the e-mail verification, starts a
 *                 game session and redirects to `next` (a foreign `next` goes to the base path);
 *                 a later sign-in follows a new name and recomputes the roles; another user
 *                 with the same name gets a suffix; a suspended account is refused. Forged
 *                 headers sign nobody in: from an untrusted peer, on another route, or on a
 *                 server in local mode (404 there). Registration, password sign-in and the dev
 *                 sign-in answer 404 in website mode.
 * Depends on:     vitest, ../src/index (types), ./harness, ./websiteHelpers
 * Spec:           docs/spec/07-integration-architecture.md §2.1, §2.3; docs/spec/03-security-architecture.md §2.2
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../src/index.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import {
  BASE,
  cookieOf,
  headersOf,
  sessionOf,
  signInAs as signInVia,
  WEBSITE,
  type Visitor,
} from './websiteHelpers.js';

let harness: Harness;
let local: App;

beforeAll(async () => {
  harness = await startHarness(WEBSITE);
  local = await buildOn(harness.pool, harness.container.getConnectionUri());
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await local.fastify.close();
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

// The proxy's request for the sign-in route, from `peer`.
const signInAs = (v: Visitor, peer = '127.0.0.1', next = `${BASE}#/`, app = harness.built) =>
  signInVia(app, v, { peer, next });
const session = (cookie: string | null, extra: Record<string, string> = {}) =>
  sessionOf(harness.built, cookie, extra);

const verifiedAt = async (accountId: string) =>
  (
    await harness.pool.query<{ v: Date | null; email: string | null; hash: string | null }>(
      'SELECT email_verified_at AS v, email, password_hash AS hash FROM sbr.accounts WHERE id = $1',
      [accountId],
    )
  ).rows[0];

describe('signing in through the website (D37)', () => {
  it('creates the account, maps the roles and redirects to the page', async () => {
    const r = await signInAs(
      { id: 'u-1', name: 'Walter', roles: 'member', verified: 'true', canHost: 'true' },
      '127.0.0.1',
      `${BASE}#/match/ABC123`,
    );
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe(`${BASE}#/match/ABC123`);
    const s = await session(cookieOf(r));
    expect(s).toMatchObject({
      signedIn: true,
      authMode: 'website',
      signInPath: `${BASE}auth/website`,
    });
    expect(s.account?.displayName).toBe('Walter');
    expect(s.permissions).toContain('match.create');
    expect(await verifiedAt(s.account?.id ?? '')).toMatchObject({ email: null, hash: null });
    expect((await verifiedAt(s.account?.id ?? ''))?.v).not.toBeNull();
  });

  it('follows a new name, recomputes the roles and the verification at the next sign-in', async () => {
    const r = await signInAs({ id: 'u-1', name: 'Walter W.', roles: 'member', verified: 'false' });
    const s = await session(cookieOf(r));
    expect(s.account?.displayName).toBe('Walter_W.');
    expect(s.permissions).not.toContain('match.create');
    expect(s.permissions).toContain('match.join');
    expect((await verifiedAt(s.account?.id ?? ''))?.v).toBeNull();
  });

  it('gives another website user with a taken name a numeric suffix', async () => {
    await signInAs({ id: 'u-2', name: 'Anna' });
    const r = await signInAs({ id: 'u-3', name: 'Anna' });
    expect((await session(cookieOf(r))).account?.displayName).toBe('Anna2');
  });

  it('sends a foreign next to the base path and refuses a suspended account', async () => {
    const away = await signInAs({ id: 'u-4', name: 'Bert' }, '127.0.0.1', 'https://evil.example/');
    expect(away.headers.location).toBe(BASE);
    const id = (await session(cookieOf(away))).account?.id;
    await harness.pool.query(`UPDATE sbr.accounts SET status = 'suspended' WHERE id = $1`, [id]);
    const refused = await signInAs({ id: 'u-4', name: 'Bert' });
    expect(refused.statusCode).toBe(403);
    expect(cookieOf(refused)).toBeNull();
  });
});

describe('forged identity headers (D37)', () => {
  it('sign nobody in from an untrusted peer', async () => {
    const r = await signInAs({ id: 'u-9', name: 'Mallory', roles: 'organiser' }, '10.0.0.9');
    expect(r.statusCode).toBe(403);
    expect(cookieOf(r)).toBeNull();
  });

  it('are ignored on another route', async () => {
    const s = await session(null, headersOf({ id: 'u-1', name: 'Walter', roles: 'organiser' }));
    expect(s.signedIn).toBe(false);
  });

  it('sign nobody in on a server in local mode, where the route does not exist', async () => {
    const r = await signInAs({ id: 'u-1', name: 'Walter' }, '127.0.0.1', '/#/', local);
    const there = await local.fastify.inject({
      method: 'GET',
      url: '/auth/website',
      headers: headersOf({ id: 'u-1', name: 'Walter' }),
    });
    expect([r.statusCode, there.statusCode]).toEqual([404, 404]);
    expect(cookieOf(there)).toBeNull();
  });
});

describe('what website mode switches off (D37)', () => {
  it('answers 404 for registration, password sign-in and the dev sign-in', async () => {
    const post = (url: string, payload: object) =>
      harness.built.fastify.inject({ method: 'POST', url: `${BASE}api/v1/${url}`, payload });
    const register = await post('auth/register', {
      email: 'a@b.cd',
      displayName: 'abc',
      password: 'x',
    });
    const login = await post('auth/login', { email: 'a@b.cd', password: 'x' });
    const dev = await post('dev/sign-in', { as: 'host' });
    expect([register.statusCode, login.statusCode, dev.statusCode]).toEqual([404, 404, 404]);
  });
});

describe('Discord steps from the website (2026-11-04)', () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const stepsOf = async (cookie: string | null) => {
    const id = (await session(cookie)).account?.id;
    const r = await harness.pool.query<{ steps: unknown }>(
      'SELECT steps FROM sbr.accounts WHERE id = $1',
      [id],
    );
    return r.rows[0]?.steps;
  };
  const golden = { ladder: 'holder', name: 'Golden', icon: '/media/step-icons/a.webp' };

  it('keeps the steps of the last sign-in, and none for an empty list', async () => {
    const first = await signInAs({ id: 'st-1', name: 'Stepper', steps: encode([golden]) });
    expect(await stepsOf(cookieOf(first))).toEqual([golden]);
    const none = await signInAs({ id: 'st-1', name: 'Stepper', steps: encode([]) });
    expect(await stepsOf(cookieOf(none))).toEqual([]);
  });

  it('signs in without steps when the header is not a valid steps list', async () => {
    const bad = encode([{ ladder: 'holder', name: 'X', icon: 'https://evil.example/x.png' }]);
    const r = await signInAs({ id: 'st-2', name: 'Shady', steps: bad });
    expect(r.statusCode).toBe(302);
    expect(await stepsOf(cookieOf(r))).toEqual([]);
  });
});
