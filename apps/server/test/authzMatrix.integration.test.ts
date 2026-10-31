/**
 * @file   apps/server/test/authzMatrix.integration.test.ts
 * @module server/test
 * @brief  Who may call what: every HTTP route and WS intent × five kinds of caller.
 *
 * Responsibility: for each route the server registers and each intent of the gateway, the
 *                 callers that get through and the ones refused (401/403 with
 *                 SIGN_IN_REQUIRED, FORBIDDEN, NOT_YOUR_MATCH or CSRF_INVALID; a refused
 *                 socket handshake) — anonymous, guest, player, another host and the
 *                 match's host, each with a fresh session; an allowed caller never meets a
 *                 server failure (5xx, INTERNAL). A route or intent missing from
 *                 the tables fails the test, so a new one cannot go in unreviewed. Bodies are
 *                 chosen so a call that gets through changes as little as possible. One write
 *                 per route group is refused without the CSRF token or with another session's.
 * Depends on:     vitest, fastify (inject), ../src/auth/*, ../src/realtime/intents,
 *                 ./harness, ./socketKit
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
import { INTENT_TYPES } from '../src/realtime/intents.js';
import { buildOn, stopOpenMatches, SUITE_TIMEOUT_MS } from './harness.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

type Role = 'anonymous' | 'guest' | 'player' | 'otherHost' | 'host';
const ROLES: readonly Role[] = ['anonymous', 'guest', 'player', 'otherHost', 'host'];
const SESSION: readonly Role[] = ['guest', 'player', 'otherHost', 'host'];
const ACCOUNTS: readonly Role[] = ['player', 'otherHost', 'host'];
const HOSTS: readonly Role[] = ['otherHost', 'host'];
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
  { method: 'GET', path: '/api/v1/matches', allow: ROLES },
  { method: 'GET', path: '/api/v1/matches/:code', allow: ROLES },
  { method: 'GET', path: '/api/v1/matches/:code/state', allow: ROLES },
  // Anyone; before the end the answer is 409 MATCH_NOT_OVER, not a refusal.
  { method: 'GET', path: '/api/v1/matches/:code/verify', allow: ROLES },
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
  { method: 'POST', path: '/dev/quicktest', body: {}, allow: ROLES },
  { method: 'POST', path: '/api/v1/auth/logout', body: {}, allow: SESSION },
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
  { method: 'POST', path: '/api/v1/matches/:code/abort', body: { reason: '' }, allow: HOST },
  { method: 'POST', path: '/api/v1/matches/:code/bots', body: { upTo: 1 }, allow: HOST },
  {
    method: 'POST',
    path: '/api/v1/matches/:code/dev-system-abort',
    body: { reason: '' },
    allow: HOST,
  },
];

// Every intent of the gateway (INTENT_TYPES); anonymous sockets are refused at the handshake.
const INTENTS: Readonly<
  Record<string, { data: (code: string) => object; allow: readonly Role[] }>
> = {
  'match.watch': { data: (code) => ({ code }), allow: SESSION },
  'match.unwatch': { data: (code) => ({ code }), allow: SESSION },
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
  code = await kit.createMatch('host');
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await stopOpenMatches(kit.harness);
  if (otherHostId !== '') await deleteAccount(kit.harness.pool, otherHostId);
  await kit.close();
}, SUITE_TIMEOUT_MS);

// A fresh session per call, so logout, sign-in or deletion cannot spoil the next one.
async function sessionOf(role: Role): Promise<{ cookie: string; csrf: string } | null> {
  if (role === 'anonymous') return null;
  const s = await createSession(kit.harness.pool, accounts[role] ?? null, null);
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
