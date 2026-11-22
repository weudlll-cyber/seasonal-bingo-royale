/**
 * @file   apps/server/test/adminScreens.integration.test.ts
 * @module server/test
 * @brief  "Screens and texts": screen values in the session answer, list sizes at once (piece 6).
 *
 * Responsibility: the page lists today's values with the schema's limits; the session answer
 *                 carries the client's screen values, and a changed one is in the next answer
 *                 (the players' next page load); a smaller "Matches in the lobby" shortens the
 *                 match list at once; a value outside its limit, a key the page does not have
 *                 and an organizer are refused; the change is audited. Matches it opened are
 *                 aborted.
 * Depends on:     vitest, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §4 (Screens and texts), §8 (i), §9 piece 6
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let h: Harness;
let admin: Client;
let host: Client;

beforeAll(async () => {
  h = await startHarness();
  admin = await signIn(h.built.fastify, 'admin');
  host = await signIn(h.built.fastify, 'host');
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

const screensOf = async (c: Client) =>
  (await c.get('/api/v1/session')).json<{ screens: Record<string, number> }>().screens;

describe('Screens and texts (admin-area §4, §8 (i))', () => {
  it('lists today’s values and sends the client its own in the session answer', async () => {
    const r = await admin.get('/api/v1/admin/screens');
    const { fields } = r.json<{ fields: { path: string; value: number; min?: number }[] }>();
    expect(fields.find((f) => f.path === 'standingsRows')).toMatchObject({ value: 20, min: 5 });
    const screens = await screensOf(host);
    expect(screens).toMatchObject({ standingsRows: 20, recapCardMs: 5_000, lobbyRefreshMs: 3_000 });
    expect(screens).not.toHaveProperty('matchList');
  });

  it('puts a changed screen value in the next session answer, audited', async () => {
    const r = await admin.post('/api/v1/admin/screens', {
      values: { standingsRows: 30, recapCardMs: 7_000 },
      comment: 'Longer lists',
    });
    expect(r.statusCode).toBe(200);
    expect(await screensOf(host)).toMatchObject({ standingsRows: 30, recapCardMs: 7_000 });
    const audit = await h.pool.query<{ target_id: string }>(
      "SELECT target_id FROM sbr.audit_log WHERE target_id LIKE 'screens@%' ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows[0]?.target_id).toBe('screens@2');
  });

  it('shortens the lobby’s match list at once', async () => {
    for (let i = 0; i < 11; i += 1) {
      await host.post('/api/v1/matches', {
        title: `List ${String(i)}`,
        gameType: 'classic',
        drawMode: 'host',
        missedNumbers: { kind: 'noAutoMark' },
        maxPlayers: 6,
      });
    }
    const all = (await host.get('/api/v1/matches')).json<{ matches: unknown[] }>().matches;
    expect(all.length).toBeGreaterThanOrEqual(11);
    await admin.post('/api/v1/admin/screens', { values: { matchList: 10 } });
    const listed = (await host.get('/api/v1/matches')).json<{ matches: unknown[] }>().matches;
    expect(listed).toHaveLength(10);
  });

  it('refuses a value outside its limit, an unknown key and an organizer', async () => {
    const path = '/api/v1/admin/screens';
    expect((await admin.post(path, { values: { standingsRows: 2 } })).statusCode).toBe(400);
    expect((await admin.post(path, { values: { other: 3 } })).statusCode).toBe(400);
    expect((await host.post(path, { values: { standingsRows: 25 } })).statusCode).toBe(403);
  });
});
