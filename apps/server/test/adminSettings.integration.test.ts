/**
 * @file   apps/server/test/adminSettings.integration.test.ts
 * @module server/test
 * @brief  The settings store, the Overview's switches, the History and its undo (piece 2).
 *
 * Responsibility: an admin switches guests and e-mail verification off and on: each change is a
 *                 new version of the `features` document with its comment, applies at once
 *                 (the session answer, guest sign-in) and is one audit entry; the History lists
 *                 the changes newest first with the admin's name; "Undo" writes a new version
 *                 with the values before the change, and a second undo of it finds nothing to
 *                 undo. Versions refuse UPDATE and DELETE. An organizer is refused every route.
 * Depends on:     vitest, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §4, §6, §8 (k), (p), §9 piece 2
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  removeGuests,
  startHarness,
  stopHarness,
  SUITE_TIMEOUT_MS,
  type Harness,
} from './harness.js';
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
  await removeGuests(h);
  await stopHarness(h);
}, SUITE_TIMEOUT_MS);

const features = async () =>
  (await host.get('/api/v1/session')).json<{
    features: { guests: boolean; emailVerification: boolean };
  }>().features;

const guestSignIn = () =>
  h.built.fastify.inject({ method: 'POST', url: '/api/v1/auth/guest', payload: {} });

interface Entry {
  id: number;
  actor: string | null;
  action: string;
  target: string;
  diff: { from?: unknown; to?: unknown; comment?: unknown };
  undoable: boolean;
}

const history = async () =>
  (await admin.get('/api/v1/admin/history')).json<{ entries: Entry[] }>().entries;

describe('the Overview switches (admin-area §8 (p))', () => {
  it('turns guests off at once, as a new version with its comment, audited', async () => {
    expect(await features()).toEqual({
      guests: true,
      emailVerification: false,
      passwordReset: false,
    });
    const r = await admin.post('/api/v1/admin/switches', {
      guests: false,
      emailVerification: false,
      comment: 'No guests tonight',
    });
    expect(r.json()).toEqual({ version: 2, switches: { guests: false, emailVerification: false } });
    expect((await features()).guests).toBe(false);
    expect((await guestSignIn()).statusCode).toBe(404);
    const [last] = await history();
    expect(last).toMatchObject({
      actor: 'dev-admin',
      action: 'settings.change',
      target: 'features@2',
      undoable: true,
      diff: {
        from: {},
        to: { guests: false, emailVerification: false },
        comment: 'No guests tonight',
      },
    });
  });
});

describe('the History and its undo (admin-area §6, §8 (k))', () => {
  it('undoes that change as a new version; a second undo finds nothing left', async () => {
    const [last] = await history();
    const undo = await admin.post(`/api/v1/admin/history/${String(last?.id)}/undo`, {});
    expect(undo.json()).toEqual({ version: 3 });
    expect((await features()).guests).toBe(true);
    expect((await guestSignIn()).statusCode).toBe(201);
    const again = await admin.post(`/api/v1/admin/history/${String(last?.id)}/undo`, {});
    expect([again.statusCode, again.json<{ code: string }>().code]).toEqual([
      409,
      'NOTHING_TO_UNDO',
    ]);
    const [newest] = await history();
    expect(newest?.diff.comment).toBe('Undo of version 2');
    const versions = await h.pool.query<{ version: number; comment: string | null }>(
      "SELECT version, comment FROM sbr.settings_versions WHERE document_id = 'features' ORDER BY version",
    );
    expect(versions.rows).toEqual([
      { version: 1, comment: null },
      { version: 2, comment: 'No guests tonight' },
      { version: 3, comment: 'Undo of version 2' },
    ]);
  });

  it('keeps every version: no change or removal', async () => {
    await expect(h.pool.query("UPDATE sbr.settings_versions SET comment = 'x'")).rejects.toThrow(
      /append-only/,
    );
    await expect(h.pool.query('DELETE FROM sbr.settings_versions')).rejects.toThrow(/append-only/);
  });

  it('refuses an organizer the switches, the History and undo', async () => {
    const body = { guests: false, emailVerification: false };
    expect((await host.post('/api/v1/admin/switches', body)).statusCode).toBe(403);
    expect((await host.get('/api/v1/admin/history')).statusCode).toBe(403);
    expect((await host.post('/api/v1/admin/history/1/undo', {})).statusCode).toBe(403);
    expect((await features()).guests).toBe(true);
  });
});
