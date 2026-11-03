/**
 * @file   apps/server/test/websiteLogin.integration.test.ts
 * @module server/test
 * @brief  Website mode: players sign in only through the website's proxy headers (D37).
 *
 * Responsibility: a server in website mode under /games/bingo/ (production settings, the test
 *                 runner's address as the trusted proxy): GET /games/bingo/auth/website with the
 *                 four headers from the trusted peer creates the account (no password, no
 *                 e-mail), maps "organiser" to hosting, mirrors the e-mail verification, starts a
 *                 game session and redirects to `next` (a foreign `next` goes to the base path);
 *                 a later sign-in follows a new name and recomputes the roles; another user
 *                 with the same name gets a suffix; a suspended account is refused. Forged
 *                 headers sign nobody in: from an untrusted peer, on another route, or on a
 *                 server in local mode (404 there). Registration, password sign-in and the dev
 *                 sign-in answer 404 in website mode.
 * Depends on:     vitest, ../src/index (types), ./harness
 * Spec:           docs/spec/07-integration-architecture.md §2.1, §2.3; docs/spec/03-security-architecture.md §2.2
 */
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../src/index.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';

const BASE = '/games/bingo/';
const WEBSITE = {
  SBR_DEV: '0',
  SBR_AUTH_MODE: 'website',
  SBR_BASE_PATH: BASE,
  SBR_PUBLIC_URL: `https://example.org${BASE}`,
  SBR_TRUSTED_PROXIES: '127.0.0.1',
};
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

interface Visitor {
  readonly id: string;
  readonly name: string;
  readonly roles?: string;
  readonly verified?: 'true' | 'false';
}

const headersOf = (v: Visitor) => ({
  'x-acting-user-id': v.id,
  'x-acting-user': v.name,
  'x-acting-user-roles': v.roles ?? 'member',
  'x-acting-user-email-verified': v.verified ?? 'false',
});

// The proxy's request for the sign-in route, from `peer`.
function signInAs(v: Visitor, peer = '127.0.0.1', next = `${BASE}#/`, app = harness.built) {
  return app.fastify.inject({
    method: 'GET',
    url: `${BASE}auth/website?next=${encodeURIComponent(next)}`,
    headers: headersOf(v),
    remoteAddress: peer,
  });
}

const cookieOf = (r: LightMyRequestResponse): string | null => {
  const c = r.cookies.find((x) => x.name.endsWith('sbr_session'));
  return c === undefined ? null : `${c.name}=${c.value}`;
};

async function sessionOf(cookie: string | null, extra: Record<string, string> = {}) {
  const r = await harness.built.fastify.inject({
    method: 'GET',
    url: `${BASE}api/v1/session`,
    headers: { ...(cookie === null ? {} : { cookie }), ...extra },
  });
  return r.json<{
    signedIn: boolean;
    account: { id: string; displayName: string } | null;
    permissions: string[];
    authMode: string;
    signInPath?: string;
  }>();
}

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
      { id: 'u-1', name: 'Walter', roles: 'member,organiser', verified: 'true' },
      '127.0.0.1',
      `${BASE}#/match/ABC123`,
    );
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe(`${BASE}#/match/ABC123`);
    const s = await sessionOf(cookieOf(r));
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
    const s = await sessionOf(cookieOf(r));
    expect(s.account?.displayName).toBe('Walter_W.');
    expect(s.permissions).not.toContain('match.create');
    expect(s.permissions).toContain('match.join');
    expect((await verifiedAt(s.account?.id ?? ''))?.v).toBeNull();
  });

  it('gives another website user with a taken name a numeric suffix', async () => {
    await signInAs({ id: 'u-2', name: 'Anna' });
    const r = await signInAs({ id: 'u-3', name: 'Anna' });
    expect((await sessionOf(cookieOf(r))).account?.displayName).toBe('Anna2');
  });

  it('sends a foreign next to the base path and refuses a suspended account', async () => {
    const away = await signInAs({ id: 'u-4', name: 'Bert' }, '127.0.0.1', 'https://evil.example/');
    expect(away.headers.location).toBe(BASE);
    const id = (await sessionOf(cookieOf(away))).account?.id;
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
    const s = await sessionOf(null, headersOf({ id: 'u-1', name: 'Walter', roles: 'organiser' }));
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
