/**
 * @file   apps/server/test/adminPresets.integration.test.ts
 * @module server/test
 * @brief  The presets: seeded from today's rules, changed, duplicated, published, retired (piece 3).
 *
 * Responsibility: the server seeds one published preset per built-in ruleset; the list offers
 *                 its values as fields with schema limits and the built-in default; an admin
 *                 changes "Time between numbers" and a match created afterwards the old way
 *                 (no chosen ruleset) freezes the new interval while an earlier match keeps its
 *                 own; a value outside the schema's limits or a path the fields do not offer is
 *                 refused; a duplicate is a draft until published; the last published preset of
 *                 a kind cannot be retired; the History's undo puts one value back and leaves the
 *                 preset's other values. Every change is audited. Matches it opened are aborted.
 * Depends on:     vitest, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §6, §8 (b), (k), (r), §9 piece 3
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

interface Field {
  path: string;
  value: unknown;
  default: unknown;
  min?: number;
  max?: number;
  unit: string;
}
interface PresetView {
  id: string;
  name: string;
  status: string;
  fields: Field[];
}

const INTERVAL = 'draws.intervalMsRealtime';
interface Draws {
  intervalMsRealtime: number;
}
const presets = async () =>
  (await admin.get('/api/v1/admin/presets')).json<{ presets: PresetView[] }>().presets;
const field = (p: PresetView | undefined, path: string) => p?.fields.find((f) => f.path === path);

// The interval a new realtime royale freezes when nothing is chosen.
async function newMatchInterval(): Promise<number> {
  const r = await host.post('/api/v1/matches', {
    title: 'Preset check',
    gameType: 'royale',
    drawMode: 'auto',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 6,
  });
  expect(r.statusCode).toBe(201);
  const row = await h.pool.query<{
    draw_interval_ms: number;
    ruleset: { draws: Draws };
    ruleset_name: string;
  }>('SELECT draw_interval_ms, ruleset, ruleset_name FROM sbr.matches WHERE code = $1', [
    r.json<{ code: string }>().code,
  ]);
  const m = row.rows[0];
  expect(m?.ruleset.draws.intervalMsRealtime).toBe(m?.draw_interval_ms);
  // The preset's id, as before presets: never the admin's name (the website filters on it).
  expect(m?.ruleset_name).toBe('royale-realtime');
  return m?.draw_interval_ms ?? -1;
}

describe('the presets (admin-area §4, §8 (b))', () => {
  it('seeds one published preset per built-in ruleset, with schema limits and defaults', async () => {
    const list = await presets();
    expect(list.map((p) => p.id)).toEqual([
      'classic-realtime',
      'classic-seasons-realtime',
      'royale-async',
      'royale-realtime',
    ]);
    expect(list.every((p) => p.status === 'published')).toBe(true);
    const royale = list.find((p) => p.id === 'royale-realtime');
    expect(field(royale, INTERVAL)).toMatchObject({ min: 2_000, max: 60_000, unit: 's' });
    expect(field(royale, INTERVAL)?.value).toBe(field(royale, INTERVAL)?.default);
    expect(field(royale, 'lobby.maxPlayers')).toBeUndefined();
  });

  it('applies a changed interval to matches created afterwards only', async () => {
    const before = await newMatchInterval();
    const r = await admin.post('/api/v1/admin/presets/royale-realtime', {
      values: { [INTERVAL]: 9_000 },
      comment: 'Slower evenings',
    });
    expect(r.statusCode).toBe(200);
    expect(field(r.json<{ preset: PresetView }>().preset, INTERVAL)?.value).toBe(9_000);
    expect(await newMatchInterval()).toBe(9_000);
    expect(before).not.toBe(9_000);
    const audit = await h.pool.query<{ target_id: string; diff: { comment: string } }>(
      "SELECT target_id, diff FROM sbr.audit_log WHERE target_id LIKE 'preset:%' ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows[0]).toMatchObject({
      target_id: 'preset:royale-realtime@2',
      diff: { comment: 'Slower evenings' },
    });
  });

  it('refuses a value outside the schema and a path the fields do not offer', async () => {
    const path = '/api/v1/admin/presets/royale-realtime';
    expect((await admin.post(path, { values: { [INTERVAL]: 500 } })).statusCode).toBe(400);
    expect((await admin.post(path, { values: { 'lobby.maxPlayers': 9 } })).statusCode).toBe(400);
    expect((await admin.post('/api/v1/admin/presets/nope', { values: {} })).statusCode).toBe(404);
    expect((await host.post(path, { values: { [INTERVAL]: 4_000 } })).statusCode).toBe(403);
  });
});

describe('publishing and undoing presets (admin-area §6, §8 (k))', () => {
  it('duplicates as a draft, publishes it, and keeps one published preset per kind', async () => {
    const copy = await admin.post('/api/v1/admin/presets/classic-realtime/duplicate', {
      name: 'Classic for the club',
    });
    expect(copy.statusCode).toBe(201);
    const id = copy.json<{ preset: PresetView }>().preset.id;
    expect(copy.json<{ preset: PresetView }>().preset.status).toBe('draft');
    const retire = (which: string) =>
      admin.post(`/api/v1/admin/presets/${which}/status`, { status: 'retired' });
    expect((await retire('classic-realtime')).json()).toEqual({ code: 'LAST_PUBLISHED' });
    const publish = await admin.post(`/api/v1/admin/presets/${id}/status`, { status: 'published' });
    expect(publish.statusCode).toBe(200);
    expect((await retire('classic-realtime')).statusCode).toBe(200);
    expect((await retire(id)).statusCode).toBe(409);
  });

  it('undoes one value of a preset and leaves its other values', async () => {
    const path = '/api/v1/admin/presets/royale-realtime';
    await admin.post(path, { values: { 'jackpot.base': 777 } });
    await admin.post(path, { values: { [INTERVAL]: 8_000 } });
    const entries = (await admin.get('/api/v1/admin/history')).json<{
      entries: { id: number; target: string }[];
    }>().entries;
    const jackpot = entries.find((e) => e.target === 'preset:royale-realtime@3');
    expect(jackpot).toBeDefined();
    const undo = await admin.post(`/api/v1/admin/history/${String(jackpot?.id)}/undo`, {});
    expect(undo.statusCode).toBe(200);
    const royale = (await presets()).find((p) => p.id === 'royale-realtime');
    expect(field(royale, 'jackpot.base')?.value).toBe(field(royale, 'jackpot.base')?.default);
    expect(field(royale, INTERVAL)?.value).toBe(8_000);
  });
});
