/**
 * @file   apps/server/test/deployment.integration.test.ts
 * @module server/test
 * @brief  The production build: no development routes; health, client and WebSocket under a base path.
 *
 * Responsibility: a production app has none of the development features — the quick
 *                 sign-in, the load-account clean-up, the Quick Test, the fast test rules,
 *                 the bot fill and the system-abort route all answer 404 (or refuse the fast
 *                 profile); an organizer signs in with a password. An app under
 *                 /games/bingo/ answers /healthz, /readyz and the client's index.html there
 *                 and opens the WebSocket on /games/bingo/ws for its public origin. While the
 *                 maintenance flag file exists, no match is created or started (503).
 * Depends on:     vitest, socket.io-client, node:fs, ./harness, ../src/auth/accounts
 * Spec:           docs/spec/09-deployment-architecture.md §1; docs/spec/08-devops-architecture.md §4
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { LightMyRequestResponse } from 'fastify';
import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../src/index.js';
import { registerAccount } from '../src/auth/accounts.js';
import { buildOn, startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn } from './session.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, SUITE_TIMEOUT_MS);
afterAll(async () => {
  await stopHarness(harness);
}, SUITE_TIMEOUT_MS);

const PRODUCTION = { NODE_ENV: 'production', SBR_DEV: '0', SBR_SEED_KEY: 'ab'.repeat(32) };
const ORGANIZER = { email: 'organizer@example.com', password: 'correct horse battery staple' };

// Signs the organizer in with the password; the session cookie and CSRF token.
async function signInOrganizer(app: App): Promise<Record<string, string>> {
  await registerAccount(harness.pool, {
    ...ORGANIZER,
    displayName: 'organizer1',
    roles: ['organizer'],
  });
  const login = await app.fastify.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: ORGANIZER,
  });
  const cookie = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const session = await app.fastify.inject({
    method: 'GET',
    url: '/api/v1/session',
    headers: { cookie },
  });
  return { cookie, 'x-csrf-token': session.json<{ csrfToken: string }>().csrfToken };
}

describe('the production build (09 §1)', () => {
  it('has no development route', async () => {
    const prod = await buildOn(harness.pool, harness.container.getConnectionUri(), PRODUCTION);
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object, headers = {}) =>
      prod.fastify.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) });
    const status = (r: LightMyRequestResponse) => r.statusCode;
    expect(status(await call('POST', '/api/v1/dev/sign-in', { as: 'host' }))).toBe(404);
    expect(status(await call('DELETE', '/api/v1/dev/load-accounts'))).toBe(404);
    expect(status(await call('POST', '/dev/quicktest', { gameType: 'royale' }))).toBe(404);
    const headers = await signInOrganizer(prod);
    const match = {
      title: 'p',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 8,
    };
    expect(
      status(await call('POST', '/api/v1/matches', { ...match, testProfile: 'fast' }, headers)),
    ).toBe(400);
    const created = await call('POST', '/api/v1/matches', match, headers);
    expect(status(created)).toBe(201);
    const { code } = created.json<{ code: string }>();
    expect(status(await call('POST', `/api/v1/matches/${code}/bots`, { upTo: 4 }, headers))).toBe(
      404,
    );
    const abort = { reason: 'test cleanup' };
    expect(
      status(await call('POST', `/api/v1/matches/${code}/dev-system-abort`, abort, headers)),
    ).toBe(404);
    expect(status(await call('POST', `/api/v1/matches/${code}/abort`, abort, headers))).toBe(200);
    await prod.fastify.close();
  }, 60_000);
});

describe('under a base path (website installs, 09 §1)', () => {
  it('answers health, the client and the WebSocket under /games/bingo/', async () => {
    const web = mkdtempSync(path.join(tmpdir(), 'sbr-web-'));
    writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>bingo</title>');
    const app = await buildOn(harness.pool, harness.container.getConnectionUri(), {
      SBR_BASE_PATH: '/games/bingo/',
      SBR_WEB_DIR: web,
      SBR_DEV: '0',
      SBR_PUBLIC_URL: 'https://site.example/games/bingo/',
    });
    const get = (url: string) => app.fastify.inject({ method: 'GET', url });
    expect((await get('/games/bingo/healthz')).statusCode).toBe(200);
    expect((await get('/games/bingo/readyz')).statusCode).toBe(200);
    expect((await get('/games/bingo/')).body).toContain('<title>bingo</title>');
    expect((await get('/games/bingo/../../etc/passwd')).statusCode).toBe(404);
    await app.fastify.listen({ host: '127.0.0.1', port: 0 });
    const address = app.fastify.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    // The handshake reaches the gateway (and refuses the missing session) only on the base path.
    const handshake = (socketPath: string) =>
      new Promise<string>((resolve) => {
        const s = connect(`http://127.0.0.1:${String(port)}/play`, {
          path: socketPath,
          transports: ['websocket'],
          extraHeaders: { origin: 'https://site.example' },
          reconnection: false,
          timeout: 3_000,
        });
        s.on('connect_error', (e) => {
          s.disconnect();
          resolve(e.message);
        });
      });
    expect(await handshake('/games/bingo/ws')).toBe('UNAUTHORIZED');
    expect(await handshake('/ws')).not.toBe('UNAUTHORIZED');
    await app.fastify.close();
    rmSync(web, { recursive: true, force: true });
  }, 60_000);
});

describe('maintenance (sbr maintenance on, 09 §4)', () => {
  it('refuses a new match and a start while the flag file exists', async () => {
    const data = mkdtempSync(path.join(tmpdir(), 'sbr-data-'));
    const app = await buildOn(harness.pool, harness.container.getConnectionUri(), {
      SBR_DATA_DIR: data,
    });
    const host = await signIn(app.fastify, 'host');
    const match = {
      title: 'm',
      gameType: 'royale',
      drawMode: 'host',
      missedNumbers: { kind: 'noAutoMark' },
      maxPlayers: 8,
    };
    const { code } = (await host.post('/api/v1/matches', match)).json<{ code: string }>();
    await host.post(`/api/v1/matches/${code}/bots`, { upTo: 4 });
    writeFileSync(path.join(data, 'maintenance'), '');
    // The app looks at the file at most every 2 seconds.
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect((await host.post('/api/v1/matches', match)).json()).toEqual({ code: 'MAINTENANCE' });
    const start = await host.post(`/api/v1/matches/${code}/start`, {});
    expect([start.statusCode, start.json()]).toEqual([503, { code: 'MAINTENANCE' }]);
    await host.post(`/api/v1/matches/${code}/abort`, { reason: 'test cleanup' });
    await app.fastify.close();
    rmSync(data, { recursive: true, force: true });
  }, 60_000);
});
