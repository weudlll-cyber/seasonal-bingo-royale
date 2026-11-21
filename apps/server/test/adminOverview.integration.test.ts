/**
 * @file   apps/server/test/adminOverview.integration.test.ts
 * @module server/test
 * @brief  The admin area's Overview: open matches, abort, maintenance, the audit log.
 *
 * Responsibility: an admin (the development account `dev-admin`, role game_admin) sees every
 *                 match in its lobby or running with its host, the maintenance state and the
 *                 version; aborts another host's match with a reason (stopped as the system,
 *                 players read the reason); switches maintenance on and off (the flag file
 *                 `sbr maintenance` writes, seen at once). Every change is one audit entry whose
 *                 hash chains to the one before; the log refuses UPDATE and DELETE. An organizer
 *                 is refused every admin route. The match it creates is aborted.
 * Depends on:     vitest, ../src/admin/audit, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §4, §6, §9 piece 1
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { entryHash } from '../src/admin/audit.js';
import { startHarness, stopHarness, SUITE_TIMEOUT_MS, type Harness } from './harness.js';
import { signIn, type Client } from './session.js';

let h: Harness;
let admin: Client;
let host: Client;
let code = '';
// Not there yet, as on a fresh install's first switch (CI found it): the switch makes it.
const tmp = mkdtempSync(path.join(tmpdir(), 'sbr-admin-'));
const dataDir = path.join(tmp, 'data');

beforeAll(async () => {
  h = await startHarness({ SBR_DATA_DIR: dataDir, SBR_VERSION: 'test-1.2.3' });
  host = await signIn(h.built.fastify, 'host');
  admin = await signIn(h.built.fastify, 'admin');
  const created = await host.post('/api/v1/matches', {
    title: 'Overview check',
    gameType: 'classic',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 6,
  });
  code = created.json<{ code: string }>().code;
}, SUITE_TIMEOUT_MS);

afterAll(async () => {
  await stopHarness(h);
  rmSync(tmp, { recursive: true, force: true });
}, SUITE_TIMEOUT_MS);

interface AuditRow {
  occurred_at: Date;
  actor_account_id: string | null;
  actor_roles: string[];
  action: string;
  target_type: string;
  target_id: string;
  diff: Record<string, unknown>;
  request_id: string | null;
  prev_hash: Buffer | null;
  hash: Buffer;
}

const auditRows = async () =>
  (await h.pool.query<AuditRow>('SELECT * FROM sbr.audit_log ORDER BY id')).rows;

describe('the Overview (admin-area §4)', () => {
  it('shows an admin every open match with its host, maintenance and the version', async () => {
    const r = await admin.get('/api/v1/admin/overview');
    expect(r.statusCode).toBe(200);
    const body = r.json<{
      matches: { code: string; host: string; status: string }[];
      maintenance: { on: boolean };
      health: { version: string; startedAt: number };
    }>();
    expect(body.matches.find((m) => m.code === code)).toMatchObject({
      host: 'dev-host',
      status: 'lobby',
    });
    expect(body.maintenance.on).toBe(false);
    expect(body.health.version).toBe('test-1.2.3');
  });

  it('refuses an organizer every admin route', async () => {
    expect((await host.get('/api/v1/admin/overview')).statusCode).toBe(403);
    const abort = await host.post(`/api/v1/admin/matches/${code}/abort`, { reason: 'mine' });
    expect(abort.statusCode).toBe(403);
    expect((await host.post('/api/v1/admin/maintenance', { on: true })).statusCode).toBe(403);
    expect(await auditRows()).toEqual([]);
  });
});

describe('changes from the Overview (admin-area §4)', () => {
  it('switches maintenance on and off from the page, seen at once, each change audited', async () => {
    const on = await admin.post('/api/v1/admin/maintenance', { on: true, reason: 'Update' });
    expect(on.json()).toEqual({ on: true, reason: 'Update' });
    expect(readFileSync(path.join(dataDir, 'maintenance'), 'utf8')).toBe('Update');
    expect((await host.get('/api/v1/maintenance')).json()).toEqual({ on: true, reason: 'Update' });
    const off = await admin.post('/api/v1/admin/maintenance', { on: false });
    expect(off.json()).toEqual({ on: false, reason: null });
    expect(existsSync(path.join(dataDir, 'maintenance'))).toBe(false);
    expect((await auditRows()).map((r) => [r.action, r.diff])).toEqual([
      ['maintenance.on', { from: null, to: 'Update' }],
      ['maintenance.off', { from: 'Update', to: null }],
    ]);
  });

  it("aborts another host's match as the system, with the admin's reason audited", async () => {
    const r = await admin.post(`/api/v1/admin/matches/${code}/abort`, { reason: 'Test of abort' });
    expect(r.statusCode).toBe(204);
    const event = await h.pool.query<{ status: string; payload: unknown }>(
      `SELECT m.status, v.payload FROM sbr.matches m
         JOIN sbr.match_events v ON v.match_id = m.id AND v.type = 'matchAborted'
        WHERE m.code = $1`,
      [code],
    );
    expect(event.rows[0]).toMatchObject({
      status: 'aborted',
      payload: { reason: 'Test of abort', by: 'system' },
    });
    const last = (await auditRows()).at(-1);
    expect([last?.action, last?.target_id, last?.diff, last?.actor_roles]).toEqual([
      'match.abort',
      code,
      { reason: 'Test of abort' },
      ['game_admin', 'player'],
    ]);
  });
});

// Each entry's stored hash is the SHA-256 of the one before and its own fields.
function chainBreaks(rows: readonly AuditRow[]): number {
  let prev: Buffer | null = null;
  let breaks = 0;
  for (const r of rows) {
    const fields = {
      occurredAtMs: r.occurred_at.getTime(),
      actorAccountId: r.actor_account_id,
      actorRoles: r.actor_roles,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      diff: r.diff,
      requestId: r.request_id,
    };
    const linked = prev === null ? r.prev_hash === null : r.prev_hash?.equals(prev) === true;
    if (!linked) breaks += 1;
    if (!entryHash(prev, fields).equals(r.hash)) breaks += 1;
    prev = r.hash;
  }
  return breaks;
}

describe('the audit log (admin-area §6)', () => {
  it('keeps the entries a hash chain that refuses changes', async () => {
    const rows = await auditRows();
    expect(rows).toHaveLength(3);
    expect(chainBreaks(rows)).toBe(0);
    await expect(h.pool.query("UPDATE sbr.audit_log SET action = 'x'")).rejects.toThrow(
      /append-only/,
    );
    await expect(h.pool.query('DELETE FROM sbr.audit_log')).rejects.toThrow(/append-only/);
  });
});
