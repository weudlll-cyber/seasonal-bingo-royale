/**
 * @file   apps/server/test/authzMatrix.integration.test.ts
 * @module server/test
 * @brief  Who may call what: every HTTP route and WS intent × five kinds of caller.
 *
 * Responsibility: for each registered route and gateway intent, the callers that get through and
 *                 those refused (401/403 with SIGN_IN_REQUIRED, FORBIDDEN, NOT_YOUR_MATCH or
 *                 CSRF_INVALID; a refused handshake) — anonymous, guest, player, another host,
 *                 the match's host, an Admin (game_admin) and the owner (super_admin), each with
 *                 a fresh session; allowed callers never meet a 5xx or INTERNAL. A route or
 *                 intent missing from the tables fails the test. Bodies keep a successful call's
 *                 changes minimal. The admin area's routes again in website mode (signed out,
 *                 guest, member, a member who may host, a website admin; D37, D41). One write per
 *                 route group is refused without the CSRF token or with another session's. The
 *                 accounts and guest sessions it creates are removed at the end.
 * Depends on:     fastify (inject), ../src/auth/*, ../src/http/app (types),
 *                 ../src/realtime/intents, ./harness, ./socketKit, ./websiteHelpers
 * Spec:           docs/spec/03-security-architecture.md §3, §8; docs/spec/12-testing-strategy.md §7;
 *                 docs/spec/05-api-design.md §2.3a; docs/spec/06-realtime-architecture.md §4.1
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteAccount, registerAccount } from '../src/auth/accounts.js';
import { createSession } from '../src/auth/sessions.js';
import type { App } from '../src/http/app.js';
import { INTENT_TYPES } from '../src/realtime/intents.js';
import {
  buildOn,
  guestSessions,
  removeGuests,
  stopOpenMatches,
  SUITE_TIMEOUT_MS,
} from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';
import {
  BASE,
  cookieOf,
  sessionOf as webSessionOf,
  signInAs,
  WEBSITE,
  type Visitor,
} from './websiteHelpers.js';

// The admin area's roles (admin-area §2.2): an Admin (game_admin) and the owner (super_admin).
type Role = 'anonymous' | 'guest' | 'player' | 'otherHost' | 'host' | 'admin' | 'superAdmin';
const ADMINS: readonly Role[] = ['admin', 'superAdmin'];
const ROLES: readonly Role[] = ['anonymous', 'guest', 'player', 'otherHost', 'host', ...ADMINS];
const SESSION: readonly Role[] = ['guest', 'player', 'otherHost', 'host', ...ADMINS];
const ACCOUNTS: readonly Role[] = ['player', 'otherHost', 'host', ...ADMINS];
const HOSTS: readonly Role[] = ['otherHost', 'host', ...ADMINS];
const HOST: readonly Role[] = ['host'];
const REFUSALS = new Set(['SIGN_IN_REQUIRED', 'FORBIDDEN', 'NOT_YOUR_MATCH', 'CSRF_INVALID']);

interface RouteCase {
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;
  readonly body?: object;
  readonly allow: readonly Role[];
  // Only when the server serves the built client (SBR_WEB_DIR, as in the image).
  readonly web?: true;
}

// The admin area's routes: Admins only, in standalone and in website mode.
const ADMIN_ROUTES: readonly RouteCase[] = [
  { method: 'GET', path: '/api/v1/admin/overview', allow: ADMINS },
  {
    method: 'POST',
    path: '/api/v1/admin/matches/:code/abort',
    body: { reason: '' },
    allow: ADMINS,
  },
  { method: 'POST', path: '/api/v1/admin/maintenance', body: {}, allow: ADMINS },
];

// `:code` is the host's match. Every route the server registers is listed here.
const ROUTES: readonly RouteCase[] = [
  { method: 'GET', path: '/', allow: ROLES },
  { method: 'GET', path: '/admin', allow: ROLES, web: true },
  { method: 'GET', path: '/*', allow: ROLES, web: true },
  { method: 'GET', path: '/healthz', allow: ROLES },
  { method: 'GET', path: '/readyz', allow: ROLES },
  { method: 'GET', path: '/metrics', allow: ROLES },
  { method: 'GET', path: '/api/v1/session', allow: ROLES },
  { method: 'GET', path: '/api/v1/maintenance', allow: ROLES },
  // The open sign-ups for the website: public (D50).
  { method: 'GET', path: '/api/public/open-rounds', allow: ROLES },
  { method: 'GET', path: '/api/v1/matches', allow: ROLES },
  { method: 'GET', path: '/api/v1/matches/:code', allow: ROLES },
  { method: 'GET', path: '/api/v1/matches/:code/state', allow: ROLES },
  // A player's own summary; any other account gets an empty answer, not a refusal.
  { method: 'GET', path: '/api/v1/matches/:code/away-summary', allow: ACCOUNTS },
  // Anyone; before the end the answer is 409 MATCH_NOT_OVER, not a refusal.
  { method: 'GET', path: '/api/v1/matches/:code/verify', allow: ROLES },
  // The boards and profiles are public; an unknown period or name is 404, not a refusal.
  { method: 'GET', path: '/api/v1/leaderboards', allow: ROLES },
  { method: 'GET', path: '/api/v1/leaderboards/:periodId', allow: ROLES },
  { method: 'GET', path: '/api/v1/leaderboards/:periodId/me', allow: ACCOUNTS },
  { method: 'GET', path: '/api/v1/players/:displayName', allow: ROLES },
  { method: 'GET', path: '/api/v1/me/export', allow: ACCOUNTS },
  // Session starters take no CSRF token; the bodies are refused before anything is made.
  { method: 'POST', path: '/api/v1/auth/register', body: {}, allow: ROLES },
  {
    method: 'POST',
    path: '/api/v1/auth/login',
    body: { email: 'x@example.com', password: 'x' },
    allow: ROLES,
  },
  { method: 'POST', path: '/api/v1/auth/guest', body: {}, allow: ROLES },
  { method: 'POST', path: '/api/v1/dev/sign-in', body: { as: 'nobody' }, allow: ROLES },
  { method: 'DELETE', path: '/api/v1/dev/load-accounts', allow: ROLES },
  // The console's demo league (no session, no CSRF); DELETE removes what POST made.
  { method: 'POST', path: '/api/v1/dev/demo-league', allow: ROLES },
  { method: 'DELETE', path: '/api/v1/dev/demo-league', allow: ROLES },
  { method: 'POST', path: '/dev/quicktest', body: {}, allow: ROLES },
  // Development only; the empty body is refused before any match moves.
  { method: 'POST', path: '/api/v1/dev/time-travel', body: {}, allow: ACCOUNTS },
  { method: 'POST', path: '/api/v1/auth/logout', body: {}, allow: SESSION },
  // A local admin's second sign-in step (D60): any session gets through to the route, which
  // answers 409 NO_TWO_FACTOR_STEP unless its second step is open.
  { method: 'POST', path: '/api/v1/auth/2fa/enrol', body: {}, allow: SESSION },
  { method: 'POST', path: '/api/v1/auth/2fa/confirm', body: { code: '000000' }, allow: SESSION },
  { method: 'POST', path: '/api/v1/auth/2fa/verify', body: { code: '000000' }, allow: SESSION },
  { method: 'DELETE', path: '/api/v1/me', body: { password: 'not the password' }, allow: ACCOUNTS },
  { method: 'POST', path: '/api/v1/matches', body: {}, allow: HOSTS },
  { method: 'POST', path: '/api/v1/matches/:code/join', body: {}, allow: ACCOUNTS },
  {
    method: 'POST',
    path: '/api/v1/matches/:code/marks',
    body: { cardIndex: 0, cell: 0 },
    allow: ACCOUNTS,
  },
  { method: 'POST', path: '/api/v1/matches/:code/start', body: {}, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/draw-next', body: {}, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/next-round', body: {}, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/draw-mode', body: { mode: 'host' }, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/auto-start', body: { auto: false }, allow: HOST },
  // Website mode only (404 here, past the host check): "Show on the website" (D50).
  { method: 'POST', path: '/api/v1/matches/:code/website', body: { show: false }, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/abort', body: { reason: '' }, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/bots', body: { upTo: 1 }, allow: HOST },
  {
    method: 'POST',
    path: '/api/v1/matches/:code/dev-system-abort',
    body: { reason: '' },
    allow: HOST,
  },
  // The admin area (admin-area §9 piece 1); the empty bodies are refused before any change.
  ...ADMIN_ROUTES,
];

// Every intent of the gateway (INTENT_TYPES); anonymous sockets are refused at the handshake.
const INTENTS: Readonly<
  Record<string, { data: (code: string) => object; allow: readonly Role[] }>
> = {
  'match.watch': { data: (code) => ({ code }), allow: SESSION },
  'match.unwatch': { data: (code) => ({ code }), allow: SESSION },
  'match.follow': { data: (code) => ({ code, follow: null }), allow: SESSION },
  mark: { data: (code) => ({ code, cardIndex: 0, cell: 0 }), allow: ACCOUNTS },
  'draw.next': { data: (code) => ({ code }), allow: HOST },
  'round.next': { data: (code) => ({ code }), allow: HOST },
  'draw.setMode': { data: (code) => ({ code, mode: 'host' }), allow: HOST },
};

let kit: SocketKit;
let code = '';
let otherHostId = '';
const accounts: Partial<Record<Role, string | null>> = { guest: null };
let address = 0;

beforeAll(async () => {
  kit = await startSocketKit();
  const pool = kit.harness.pool;
  const ids = await pool.query<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM sbr.accounts WHERE display_name IN ('dev-host', 'dev-player-1')",
  );
  accounts.host = ids.rows.find((r) => r.display_name === 'dev-host')?.id ?? null;
  accounts.player = ids.rows.find((r) => r.display_name === 'dev-player-1')?.id ?? null;
  const other = await registerAccount(pool, {
    email: 'other-host@example.com',
    displayName: 'otherhost1',
    password: 'correct horse battery staple',
    roles: ['organizer'],
  });
  otherHostId = other.ok ? other.id : '';
  accounts.otherHost = otherHostId;
  for (const [role, seeded] of [
    ['admin', 'game_admin'],
    ['superAdmin', 'super_admin'],
  ] as const) {
    const made = await registerAccount(pool, {
      email: `${role}@example.com`,
      displayName: `authz${role}`,
      password: 'correct horse battery staple',
      roles: [seeded],
    });
    accounts[role] = made.ok ? made.id : null;
  }
  code = await kit.createMatch('host');
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await stopOpenMatches(kit.harness);
  for (const id of [otherHostId, accounts.admin, accounts.superAdmin]) {
    if (id) await deleteAccount(kit.harness.pool, id);
  }
  await removeGuests(kit.harness);
  expect(await guestSessions(kit.harness)).toBe(0);
  await kit.close();
}, SUITE_TIMEOUT_MS);

// A fresh session per call, so logout, sign-in or deletion cannot spoil the next one.
async function sessionOf(role: Role): Promise<{ cookie: string; csrf: string } | null> {
  if (role === 'anonymous') return null;
  const s = await createSession(kit.harness.pool, accounts[role] ?? null, null);
  // An Admin's session counts once its second step is done (D60); the matrix tests the route.
  if (ADMINS.includes(role)) {
    await kit.harness.pool.query(
      'UPDATE sbr.sessions SET last_2fa_at = now() WHERE account_id = $1',
      [accounts[role]],
    );
  }
  return { cookie: `sbr_session=${s.token}`, csrf: s.csrfToken };
}

async function call(
  role: Role,
  route: RouteCase,
  app: FastifyInstance = kit.harness.built.fastify,
): Promise<{ status: number; code: unknown }> {
  const s = await sessionOf(role);
  address += 1;
  const options: InjectOptions = {
    method: route.method,
    url: route.path.replace(':code', code).replace('*', 'index.html'),
    // One address per call: the per-address limits stay out of the way.
    remoteAddress: `10.30.${String(Math.floor(address / 250))}.${String(address % 250)}`,
    headers: s === null ? {} : { cookie: s.cookie, 'x-csrf-token': s.csrf },
    ...(route.body === undefined ? {} : { payload: route.body }),
  };
  const r = await app.inject(options);
  const body = r.body.startsWith('{') ? r.json<{ code?: unknown }>() : {};
  return { status: r.statusCode, code: body.code };
}

const refused = (status: number, answer: unknown) =>
  (status === 401 || status === 403) && REFUSALS.has(String(answer));

// "METHOD /path" for every route Fastify registered (HEAD is Fastify's own copy of GET).
function registeredRoutes(app: FastifyInstance): string[] {
  const out: string[] = [];
  const stack: { depth: number; path: string }[] = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const node = treeNode(line);
    if (node === null) continue;
    while ((stack.at(-1)?.depth ?? -1) >= node.depth) stack.pop();
    const path = joinPath(stack.at(-1)?.path ?? '', node.segment);
    stack.push({ depth: node.depth, path });
    for (const method of node.methods) out.push(`${method} ${path}`);
  }
  return out.sort();
}

// One line of the tree: its indent, its path segment and its methods.
function treeNode(line: string): { depth: number; segment: string; methods: string[] } | null {
  const m = /^([\s│├└─]*)(\S+?)(?: \(([A-Z, ]+)\))?$/u.exec(line);
  if (m === null) return null;
  const methods = (m[3] ?? '').split(', ').filter((x) => x !== '' && x !== 'HEAD');
  return { depth: (m[1] ?? '').length, segment: m[2] ?? '', methods };
}

// Children of the root carry no leading slash; deeper ones do.
function joinPath(parent: string, segment: string): string {
  if (parent === '') return segment;
  return parent === '/' ? `/${segment}` : `${parent}${segment}`;
}

describe('the authorization matrix: HTTP routes', () => {
  it('lists every registered route, and only those', () => {
    const listed = ROUTES.filter((r) => r.web !== true).map((r) => `${r.method} ${r.path}`);
    expect(registeredRoutes(kit.harness.built.fastify)).toEqual(listed.sort());
  });

  it('lists the routes of a server that serves the built client, and lets everyone read them', async () => {
    const web = mkdtempSync(path.join(tmpdir(), 'sbr-authz-'));
    writeFileSync(path.join(web, 'index.html'), '<!doctype html>');
    const app = await buildOn(kit.harness.pool, kit.harness.container.getConnectionUri(), {
      SBR_WEB_DIR: web,
    });
    const listed = ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(registeredRoutes(app.fastify)).toEqual(listed.sort());
    for (const route of ROUTES.filter((r) => r.web === true)) {
      for (const role of ROLES) expect((await call(role, route, app.fastify)).status).toBe(200);
    }
    await app.fastify.close();
    rmSync(web, { recursive: true, force: true });
  });

  it('lets through exactly the callers each route allows', async () => {
    const wrong: string[] = [];
    for (const route of ROUTES.filter((r) => r.web !== true)) {
      for (const role of ROLES) {
        const r = await call(role, route);
        const allowed = route.allow.includes(role);
        // An allowed caller is let through and the server does not fail (no 5xx).
        if (refused(r.status, r.code) === allowed || (allowed && r.status >= 500)) {
          wrong.push(
            `${route.method} ${route.path} as ${role}: ${String(r.status)} ${String(r.code)}`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  }, 120_000);
});

// Website mode (D37, D41, D46): a member, a member the website lets host (organizer), a website
// admin (game_admin) and a guest; nobody is super_admin there. Sessions come from the proxy's
// sign-in; the accounts this makes are removed at the end.
const WEB_VISITORS = {
  player: { id: 'authz-w1', name: 'Authz_Member' },
  host: { id: 'authz-w2', name: 'Authz_Host', canHost: 'true' },
  admin: { id: 'authz-w3', name: 'Authz_Admin', roles: 'admin' },
} as const satisfies Record<string, Visitor>;

async function webSession(app: App, who: keyof typeof WEB_VISITORS | 'guest') {
  const r =
    who === 'guest'
      ? await app.fastify.inject({ method: 'POST', url: `${BASE}api/v1/auth/guest`, payload: {} })
      : await signInAs(app, WEB_VISITORS[who]);
  const cookie = cookieOf(r);
  const s = await webSessionOf(app, cookie);
  return { cookie, csrf: s.csrfToken, accountId: s.account?.id ?? null };
}

// One admin route under the website's base path, with the session's cookie and token.
async function webCall(
  app: App,
  s: { cookie: string | null; csrf: string | null } | null,
  route: RouteCase,
): Promise<{ status: number; code: unknown }> {
  const r = await app.fastify.inject({
    method: route.method,
    url: `${BASE}${route.path.slice(1).replace(':code', code)}`,
    headers: s === null ? {} : { cookie: s.cookie ?? '', 'x-csrf-token': s.csrf ?? '' },
    ...(route.body === undefined ? {} : { payload: route.body }),
  });
  const body = r.body.startsWith('{') ? r.json<{ code?: unknown }>() : {};
  return { status: r.statusCode, code: body.code };
}

describe('the authorization matrix: the admin area in website mode', () => {
  it('lets only the website admins through', async () => {
    const app = await buildOn(kit.harness.pool, kit.harness.container.getConnectionUri(), WEBSITE);
    const made: string[] = [];
    const wrong: string[] = [];
    for (const who of ['anonymous', 'guest', 'player', 'host', 'admin'] as const) {
      const s = who === 'anonymous' ? null : await webSession(app, who);
      if (s?.accountId) made.push(s.accountId);
      for (const route of ADMIN_ROUTES) {
        const r = await webCall(app, s, route);
        if (refused(r.status, r.code) === (who === 'admin') || r.status >= 500) {
          wrong.push(`${route.method} ${route.path} as ${who}: ${String(r.status)}`);
        }
      }
    }
    for (const id of made) await deleteAccount(kit.harness.pool, id);
    await app.fastify.close();
    expect(wrong).toEqual([]);
  }, 120_000);
});

describe('the authorization matrix: WS intents', () => {
  it('lists every intent of the gateway', () => {
    expect(Object.keys(INTENTS).sort()).toEqual([...INTENT_TYPES].sort());
  });

  it('refuses a socket without a session and answers each intent as allowed', async () => {
    expect(await kit.connected(kit.open(null))).not.toBe('ok');
    const wrong: string[] = [];
    for (const [t, intent] of Object.entries(INTENTS)) {
      for (const role of SESSION) {
        const s = await sessionOf(role);
        const socket = kit.open(s?.cookie ?? null);
        expect(await kit.connected(socket)).toBe('ok');
        const answer = await kit.send(socket, t, intent.data(code));
        socket.disconnect();
        const isRefused = !answer.ok && REFUSALS.has(answer.code ?? '');
        const failed = !answer.ok && answer.code === 'INTERNAL';
        if (isRefused === intent.allow.includes(role) || failed) {
          wrong.push(`${t} as ${role}: ${answer.ok ? 'ok' : (answer.code ?? '?')}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  }, 120_000);

  it('answers an intent nobody listed with UNKNOWN_INTENT', async () => {
    const socket = kit.open(kit.host.cookie);
    expect(await kit.connected(socket)).toBe('ok');
    expect((await kit.send(socket, 'chat.send', {})).code).toBe('UNKNOWN_INTENT');
    socket.disconnect();
  });
});

// One write of each route group: without the session's CSRF token, or with another one,
// the server refuses it before anything happens (03 §8).
const CSRF_WRITES: readonly RouteCase[] = [
  { method: 'POST', path: '/api/v1/auth/logout', body: {}, allow: HOST },
  { method: 'DELETE', path: '/api/v1/me', body: { password: 'not the password' }, allow: HOST },
  { method: 'POST', path: '/api/v1/matches', body: {}, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/join', body: {}, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/draw-mode', body: { mode: 'host' }, allow: HOST },
];

describe('CSRF on every route group', () => {
  it('refuses a write without the token and with a token of another session', async () => {
    const other = await sessionOf('player');
    for (const route of CSRF_WRITES) {
      for (const token of [undefined, other?.csrf ?? 'x']) {
        const s = await sessionOf('host');
        const r = await kit.harness.built.fastify.inject({
          method: route.method,
          url: route.path.replace(':code', code),
          headers: {
            cookie: s?.cookie ?? '',
            ...(token === undefined ? {} : { 'x-csrf-token': token }),
          },
          payload: route.body ?? {},
        });
        expect([
          route.path,
          token === undefined,
          r.statusCode,
          r.json<{ code: string }>().code,
        ]).toEqual([route.path, token === undefined, 403, 'CSRF_INVALID']);
      }
    }
  });
});
