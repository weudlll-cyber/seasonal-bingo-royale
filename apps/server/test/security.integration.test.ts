/**
 * @file   apps/server/test/security.integration.test.ts
 * @module server/test
 * @brief  The audit's security fixes (S3–S10) against a listening server.
 *
 * Responsibility: per-address limits for guest sessions and requests without a session;
 *                 dead sessions purged; a socket closes when its session ends (logout,
 *                 account deletion); the cookie is `__Secure-` with the base path under a
 *                 path and cleared with Secure; admin accounts get short sessions; the
 *                 Permissions-Policy header; /metrics refused through a proxy; no account
 *                 ids to anonymous viewers, a deleted player shown as such; a broken
 *                 %-escape answers 400.
 * Depends on:     vitest, node:fs, ./socketKit, ./harness, ./session, ../src/auth/*
 * Spec:           docs/spec/03-security-architecture.md §3, §7, §13; docs/spec/06-realtime-architecture.md §2.3
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { InjectOptions } from 'fastify';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerAccount } from '../src/auth/accounts.js';
import { purgeDeadSessions } from '../src/auth/sessions.js';
import { buildOn, stopOpenMatches, SUITE_TIMEOUT_MS } from './harness.js';
import { signIn } from './session.js';
import { startSocketKit, type SocketKit } from './socketKit.js';

let kit: SocketKit;

beforeAll(async () => {
  kit = await startSocketKit();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopOpenMatches(kit.harness);
  await kit.close();
}, SUITE_TIMEOUT_MS);

const PASSWORD = 'correct horse battery staple';
const inject = (o: InjectOptions) => kit.harness.built.fastify.inject(o);

// Waits for the socket's disconnect, or answers 'still connected' after 3 s.
const closed = (s: Socket) =>
  new Promise<string>((resolve) => {
    s.on('disconnect', (reason) => {
      resolve(reason);
    });
    setTimeout(() => {
      resolve('still connected');
    }, 3_000);
  });

describe('per-address limits and session retention (S3)', () => {
  it('limits guest sessions and requests without a session per address', async () => {
    const guest = () =>
      inject({ method: 'POST', url: '/api/v1/auth/guest', payload: {}, remoteAddress: '10.9.0.1' });
    for (let i = 0; i < 10; i += 1) expect((await guest()).statusCode).toBe(201);
    expect((await guest()).statusCode).toBe(429);
    const anonymous = () =>
      inject({ method: 'GET', url: '/api/v1/session', remoteAddress: '10.9.0.2' });
    // 600 a minute, refilled as time passes: well within 700 requests one is refused.
    const answers: number[] = [];
    for (let i = 0; i < 700; i += 1) answers.push((await anonymous()).statusCode);
    expect(answers).toContain(429);
  });

  it('purges revoked and expired sessions, keeps live ones', async () => {
    const live = await signIn(kit.harness.built.fastify, 'player-2');
    const pool = kit.harness.pool;
    await pool.query(
      `INSERT INTO sbr.sessions (token_hash, csrf_token, kind, expires_at, idle_expires_at)
       VALUES (decode('aa', 'hex'), 'x', 'guest', now() - interval '1 minute', now() + interval '1 day'),
              (decode('bb', 'hex'), 'x', 'guest', now() + interval '1 day', now() - interval '1 minute')`,
    );
    expect(await purgeDeadSessions(pool)).toBeGreaterThanOrEqual(2);
    const left = await pool.query(
      "SELECT 1 FROM sbr.sessions WHERE token_hash IN (decode('aa','hex'), decode('bb','hex'))",
    );
    expect(left.rowCount).toBe(0);
    expect((await live.get('/api/v1/session')).json<{ signedIn: boolean }>().signedIn).toBe(true);
  });
});

describe('sockets of an ended session (S4)', () => {
  it('closes the socket at logout', async () => {
    const client = await signIn(kit.harness.built.fastify, 'player-3');
    const s = kit.open(client.cookie);
    expect(await kit.connected(s)).toBe('ok');
    const done = closed(s);
    expect((await client.post('/api/v1/auth/logout', {})).statusCode).toBe(204);
    expect(await done).toBe('io server disconnect');
  });

  it('closes the socket when the account is deleted', async () => {
    const email = 'gone@example.com';
    const r = await inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, displayName: 'gone1', password: PASSWORD },
      remoteAddress: '10.9.0.3',
    });
    const cookie = `sbr_session=${r.cookies.find((c) => c.name === 'sbr_session')?.value ?? ''}`;
    const csrf = (
      await inject({ method: 'GET', url: '/api/v1/session', headers: { cookie } })
    ).json<{ csrfToken: string }>().csrfToken;
    const s = kit.open(cookie);
    expect(await kit.connected(s)).toBe('ok');
    const done = closed(s);
    const del = await inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { password: PASSWORD },
    });
    expect(del.statusCode).toBe(204);
    expect(await done).toBe('io server disconnect');
  });
});

describe('the session cookie (S5)', () => {
  it('scopes the cookie to the base path and clears it with Secure', async () => {
    await registerAccount(kit.harness.pool, {
      email: 'scoped@example.com',
      displayName: 'scoped1',
      password: PASSWORD,
    });
    const app = await buildOn(kit.harness.pool, kit.harness.container.getConnectionUri(), {
      NODE_ENV: 'production',
      SBR_DEV: '0',
      SBR_SEED_KEY: 'ab'.repeat(32),
      SBR_BASE_PATH: '/games/bingo/',
    });
    const login = await app.fastify.inject({
      method: 'POST',
      url: '/games/bingo/api/v1/auth/login',
      payload: { email: 'scoped@example.com', password: PASSWORD },
    });
    const set = String(login.headers['set-cookie']);
    expect(set).toMatch(
      /^__Secure-sbr_session=.+; Path=\/games\/bingo; HttpOnly; Secure; SameSite=Lax/,
    );
    const cookie = set.split(';')[0] ?? '';
    const csrf = (
      await app.fastify.inject({
        method: 'GET',
        url: '/games/bingo/api/v1/session',
        headers: { cookie },
      })
    ).json<{ csrfToken: string }>().csrfToken;
    const out = await app.fastify.inject({
      method: 'POST',
      url: '/games/bingo/api/v1/auth/logout',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {},
    });
    expect(String(out.headers['set-cookie'])).toMatch(
      /^__Secure-sbr_session=; .*Path=\/games\/bingo.*Secure/,
    );
    await app.fastify.close();
  });
});

describe('lifetimes, headers and metrics (S6, S7, S8)', () => {
  it('gives an admin account a 30-minute idle and 8-hour absolute session', async () => {
    await registerAccount(kit.harness.pool, {
      email: 'boss@example.com',
      displayName: 'boss1',
      password: PASSWORD,
      roles: ['super_admin'],
    });
    await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'boss@example.com', password: PASSWORD },
      remoteAddress: '10.9.0.4',
    });
    const row = await kit.harness.pool.query<{ kind: string; idle: number; absolute: number }>(
      `SELECT s.kind, extract(epoch FROM s.idle_expires_at - now())::int AS idle,
              extract(epoch FROM s.expires_at - now())::int AS absolute
         FROM sbr.sessions s JOIN sbr.accounts a ON a.id = s.account_id WHERE a.email = 'boss@example.com'`,
    );
    const s = row.rows[0];
    expect(s?.kind).toBe('admin');
    expect(s?.idle).toBeLessThanOrEqual(30 * 60);
    expect(s?.absolute).toBeLessThanOrEqual(8 * 3600);
  });

  it('sends the Permissions-Policy and keeps /metrics from proxied requests', async () => {
    const health = await inject({ method: 'GET', url: '/healthz' });
    expect(health.headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    expect((await inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(200);
    const proxied = await inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(proxied.statusCode).toBe(404);
  });
});

describe('what anonymous viewers see (S10)', () => {
  it('shows no account id and names a deleted player as such', async () => {
    const host = kit.host;
    const code = await kit.createMatch('host');
    const email = 'leaver@example.com';
    await registerAccount(kit.harness.pool, { email, displayName: 'leaver1', password: PASSWORD });
    const login = await inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
      remoteAddress: '10.9.0.5',
    });
    const cookie = `sbr_session=${login.cookies.find((c) => c.name === 'sbr_session')?.value ?? ''}`;
    const csrf = (
      await inject({ method: 'GET', url: '/api/v1/session', headers: { cookie } })
    ).json<{ csrfToken: string }>().csrfToken;
    const ids = await kit.harness.pool.query<{
      id: string;
      email: string | null;
      display_name: string;
    }>(
      "SELECT id, email, display_name FROM sbr.accounts WHERE email = $1 OR display_name = 'dev-host'",
      [email],
    );
    const leaverId = ids.rows.find((r) => r.email === email)?.id ?? 'none';
    const hostId = ids.rows.find((r) => r.display_name === 'dev-host')?.id ?? 'none';
    await inject({
      method: 'POST',
      url: `/api/v1/matches/${code}/join`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {},
    });
    await inject({
      method: 'DELETE',
      url: '/api/v1/me',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { password: PASSWORD },
    });
    const anonymous = await inject({ method: 'GET', url: `/api/v1/matches/${code}/state` });
    const body = anonymous.body;
    expect(body).not.toContain(leaverId);
    expect(body).not.toContain(hostId);
    expect(body).toMatch(/deleted player [0-9a-f]{4}/);
    expect((await host.get(`/api/v1/matches/${code}`)).json()).not.toHaveProperty('createdBy');
  });
});

describe('client paths (S10)', () => {
  it('answers 400 for a broken %-escape and decodes a client path only once', async () => {
    const web = mkdtempSync(path.join(tmpdir(), 'sbr-web-'));
    writeFileSync(path.join(web, 'index.html'), '<!doctype html>');
    const app = await buildOn(kit.harness.pool, kit.harness.container.getConnectionUri(), {
      SBR_WEB_DIR: web,
    });
    const status = async (url: string) =>
      (await app.fastify.inject({ method: 'GET', url })).statusCode;
    expect(await status('/assets/%E0%A4%A')).toBe(400);
    // Decoded once by the router: "%25zz" names the file "%zz", which is not there.
    expect(await status('/assets/%25zz')).toBe(404);
    await app.fastify.close();
    rmSync(web, { recursive: true, force: true });
  });
});
