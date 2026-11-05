/**
 * @file   apps/server/test/websiteRules.integration.test.ts
 * @module server/test
 * @brief  Website mode: who may host and administer, deleting an account, the return path, the proxy secret.
 *
 * Responsibility: a server in website mode under /games/bingo/ (./websiteHelpers) and one in
 *                 local mode on the same database. A member the website allows to start games
 *                 (X-Acting-User-Can-Host: true) and a website admin may host, nobody else, the
 *                 website role does not decide it (2026-11-04); a website admin is a game admin until the website
 *                 drops the role (D41); no website role ever maps to super_admin or
 *                 security_admin. A website account is deleted by typing its display name (D42);
 *                 a local account still needs its password. GET <base>auth/website/login sends a
 *                 visitor to the website's login with the sign-in route and the wanted page as
 *                 its return path; a `next` that is no path under the base path becomes the
 *                 lobby (D43). The identity headers count only with the proxy secret.
 * Depends on:     vitest, ../src/index (types), ./harness, ./websiteHelpers
 * Spec:           docs/spec/07-integration-architecture.md §2.1, §2.3; docs/spec/05-api-design.md §2.1, §2.2
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../src/index.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import {
  BASE,
  cookieOf,
  headersOf,
  SECRET,
  sessionOf,
  signInAs,
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

const website = () => harness.built;

// Signs the visitor in through the proxy; the game session and the account's roles.
async function signedIn(v: Visitor) {
  const r = await signInAs(website(), v);
  expect(r.statusCode).toBe(302);
  const cookie = cookieOf(r);
  const s = await sessionOf(website(), cookie);
  const roles = await harness.pool.query<{ role_id: string }>(
    'SELECT role_id FROM sbr.role_assignments WHERE account_id = $1 ORDER BY role_id',
    [s.account?.id],
  );
  return { cookie, session: s, roles: roles.rows.map((row) => row.role_id) };
}

describe('signing in again through the website (03 §3)', () => {
  it('ends the session the browser had before (audit-3 S2)', async () => {
    const visitor = { id: 'r-9', name: 'Rita' };
    const first = cookieOf(await signInAs(website(), visitor));
    expect((await sessionOf(website(), first)).signedIn).toBe(true);
    const again = await website().fastify.inject({
      method: 'GET',
      url: `${BASE}auth/website?next=${encodeURIComponent(`${BASE}#/`)}`,
      headers: { ...headersOf(visitor), 'x-sbr-proxy-secret': SECRET, cookie: first ?? '' },
      remoteAddress: '127.0.0.1',
    });
    expect(again.statusCode).toBe(302);
    expect((await sessionOf(website(), first)).signedIn).toBe(false);
    expect((await sessionOf(website(), cookieOf(again))).signedIn).toBe(true);
  });
});

describe('who hosts in website mode (2026-11-04, replaces D40; D41)', () => {
  it('lets a member the website allows to start games host, and an admin; nobody else', async () => {
    const host = await signedIn({ id: 'r-1', name: 'Olga', roles: 'member', canHost: 'true' });
    const admin = await signedIn({ id: 'r-2', name: 'Adam', roles: 'admin' });
    const member = await signedIn({ id: 'r-3', name: 'Mona', roles: 'member' });
    const organiser = await signedIn({ id: 'r-6', name: 'Oris', roles: 'member,organiser' });
    expect(host.session.permissions).toContain('match.create');
    expect(admin.session.permissions).toContain('match.create');
    expect(member.session.permissions).not.toContain('match.create');
    expect(organiser.session.permissions).not.toContain('match.create');
    // Recomputed at every sign-in: the website takes the permission back.
    const taken = await signedIn({ id: 'r-1', name: 'Olga', roles: 'member', canHost: 'false' });
    expect(taken.session.permissions).not.toContain('match.create');
  });

  it('makes a website admin a game admin until the website drops the role', async () => {
    const admin = await signedIn({ id: 'r-4', name: 'Ada', roles: 'member,admin' });
    expect(admin.roles).toEqual(['game_admin', 'player']);
    expect(admin.session.permissions).toContain('match.abort');
    const dropped = await signedIn({ id: 'r-4', name: 'Ada', roles: 'member' });
    expect(dropped.roles).toEqual(['player']);
    expect(dropped.session.permissions).not.toContain('match.abort');
  });

  it('never maps any website role to super_admin or security_admin', async () => {
    const all = 'super_admin,superadmin,security_admin,game_admin,owner,admin,organiser,organizer';
    const greedy = await signedIn({ id: 'r-5', name: 'Greedy', roles: all, canHost: 'true' });
    expect(greedy.roles).toEqual(['game_admin', 'organizer', 'player']);
  });
});

describe('deleting the own account (D42)', () => {
  const remove = (app: App, cookie: string | null, csrf: string | null, payload: object) =>
    app.fastify.inject({
      method: 'DELETE',
      url: app === local ? '/api/v1/me' : `${BASE}api/v1/me`,
      payload,
      headers: { ...(cookie === null ? {} : { cookie }), 'x-csrf-token': csrf ?? '' },
    });

  it('deletes a website account once its display name is typed, without a password', async () => {
    const { cookie, session } = await signedIn({ id: 'd-1', name: 'Dora' });
    const wrong = await remove(website(), cookie, session.csrfToken, { displayName: 'dora' });
    const password = await remove(website(), cookie, session.csrfToken, { password: 'x' });
    expect([wrong.body, password.body]).toEqual([
      '{"code":"NAME_REQUIRED"}',
      '{"code":"NAME_REQUIRED"}',
    ]);
    const ok = await remove(website(), cookie, session.csrfToken, { displayName: 'Dora' });
    expect(ok.statusCode).toBe(204);
    expect((await sessionOf(website(), cookie)).signedIn).toBe(false);
    const left = await harness.pool.query('SELECT 1 FROM sbr.accounts WHERE id = $1', [
      session.account?.id,
    ]);
    expect(left.rowCount).toBe(0);
  });

  it('keeps asking a local account for its password, not its name', async () => {
    const password = 'a sturdy local passphrase 42';
    const created = await local.fastify.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      remoteAddress: '10.0.0.42',
      payload: { email: 'local-d42@example.com', displayName: 'LocalLou', password },
    });
    const cookie = cookieOf(created);
    const s = await sessionOf(local, cookie, {}, '/');
    const byName = await remove(local, cookie, s.csrfToken, { displayName: 'LocalLou' });
    expect(byName.body).toBe('{"code":"PASSWORD_REQUIRED"}');
    expect((await remove(local, cookie, s.csrfToken, { password })).statusCode).toBe(204);
  });
});

describe('the page wanted before the website login (D43)', () => {
  const loginHop = (next: string) =>
    website().fastify.inject({
      method: 'GET',
      url: `${BASE}auth/website/login?next=${encodeURIComponent(next)}`,
    });
  const loginFor = (next: string) =>
    `/login?next=${encodeURIComponent(`${BASE}auth/website?next=${encodeURIComponent(next)}`)}`;

  it('sends the visitor to the website login with the sign-in route and the page', async () => {
    const r = await loginHop(`${BASE}#/match/ABC123`);
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe(loginFor(`${BASE}#/match/ABC123`));
    const named = await loginHop(`${BASE}#/players/J%C3%BCrgen`);
    expect(named.headers.location).toBe(loginFor(`${BASE}#/players/J%C3%BCrgen`));
  });

  it('sends a visitor the website answers as a guest to its login, keeping any game session', async () => {
    const { cookie } = await signedIn({ id: 'g-1', name: 'Gina' });
    const next = `${BASE}#/match/ABC123`;
    const asGuest = (extra: Record<string, string>) =>
      website().fastify.inject({
        method: 'GET',
        url: `${BASE}auth/website?next=${encodeURIComponent(next)}`,
        headers: { 'x-sbr-proxy-secret': SECRET, ...extra },
        remoteAddress: '127.0.0.1',
      });
    const login = `${BASE}auth/website/login?next=${encodeURIComponent(next)}`;
    for (const extra of [{ 'x-acting-guest': 'true', cookie: cookie ?? '' }, {}]) {
      const r = await asGuest(extra);
      expect(r.statusCode).toBe(302);
      expect(r.headers.location).toBe(login);
      expect(cookieOf(r)).toBeNull();
    }
    expect((await sessionOf(website(), cookie)).account?.displayName).toBe('Gina');
  });

  it.each([
    'https://evil.example/',
    '//evil.example/games/bingo/',
    '/games/bingo//evil.example',
    '/games/bingo/\\evil.example',
    '/elsewhere/',
    '/games/bingoX/',
    'javascript:alert(1)',
    `${BASE}#/x y`,
  ])('turns the return path %s into the lobby', async (next) => {
    expect((await loginHop(next)).headers.location).toBe(loginFor(BASE));
    const back = await signInAs(website(), { id: 'n-1', name: 'Nina' }, { next });
    expect(back.headers.location).toBe(BASE);
  });
});

describe('the proxy secret', () => {
  it('signs nobody in without it or with a wrong one, even from the trusted address', async () => {
    const who = { id: 's-1', name: 'Sam', roles: 'admin' };
    const none = await signInAs(website(), who, { secret: null });
    const wrong = await signInAs(website(), who, { secret: 'f'.repeat(64) });
    expect([none.statusCode, wrong.statusCode]).toEqual([403, 403]);
    expect([cookieOf(none), cookieOf(wrong)]).toEqual([null, null]);
    expect((await signInAs(website(), who)).statusCode).toBe(302);
  });
});
