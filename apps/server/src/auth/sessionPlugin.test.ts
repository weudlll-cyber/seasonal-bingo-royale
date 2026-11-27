/**
 * @file   apps/server/src/auth/sessionPlugin.test.ts
 * @module server/auth
 * @brief  A write must say it comes from this site, before any token (kit writeCheck, 03 §8).
 *
 * Responsibility: through a route that starts a session (no token yet): a write the browser
 *                 names as this site's own passes; one naming another site, another origin or
 *                 nothing at all is refused; behind a trusted proxy the forwarded host counts; a
 *                 read is never checked.
 * Depends on:     vitest, fastify, ./sessionPlugin
 * Spec:           docs/spec/03-security-architecture.md §8
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerSessions } from './sessionPlugin.js';

async function server(): Promise<FastifyInstance> {
  const app = Fastify();
  await registerSessions(
    app,
    {} as never,
    { name: 'sbr_session', secure: false, path: '/' },
    { trustedProxies: ['127.0.0.1'] },
  );
  app.post('/api/v1/auth/login', () => ({ ok: true }));
  app.get('/api/v1/thing', () => ({ ok: true }));
  return app;
}

const write = async (headers: Record<string, string>, remoteAddress = '203.0.113.7') =>
  (
    await (
      await server()
    ).inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {},
      headers: { host: 'game.example', ...headers },
      remoteAddress,
    })
  ).statusCode;

// The first case loads Fastify and its plugins: past the 5 s default on a busy machine.
describe('where a write comes from', { timeout: 30_000 }, () => {
  it('passes a write the browser names as this site’s own', async () => {
    expect(await write({ 'sec-fetch-site': 'same-origin' })).toBe(200);
    expect(await write({ origin: 'https://game.example' })).toBe(200);
  });

  it('refuses another site, another origin and a write that names neither', async () => {
    expect(await write({ 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(await write({ 'sec-fetch-site': 'same-site' })).toBe(403);
    expect(await write({ origin: 'https://evil.example' })).toBe(403);
    expect(await write({})).toBe(403);
  });

  it("believes the forwarded host from the trusted proxy's address only", async () => {
    const headers = { origin: 'https://public.example', 'x-forwarded-host': 'public.example' };
    expect(await write(headers, '127.0.0.1')).toBe(200);
    expect(await write(headers)).toBe(403);
  });

  it('never checks a read', async () => {
    const r = await (
      await server()
    ).inject({ url: '/api/v1/thing', headers: { 'sec-fetch-site': 'cross-site' } });
    expect(r.statusCode).toBe(200);
  });
});
