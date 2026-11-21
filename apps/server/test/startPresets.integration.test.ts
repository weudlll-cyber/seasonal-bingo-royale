/**
 * @file   apps/server/test/startPresets.integration.test.ts
 * @module server/test
 * @brief  The Organizer starts a match from a preset: speed in words, inside the preset's bounds.
 *
 * Responsibility: an organizer lists the published presets and sees their Organizer part, not
 *                 their rules; a match from a preset with "quick" freezes the preset's rules,
 *                 its id as the ruleset name and the quick interval; players outside the
 *                 preset's range, a start the preset does not allow, a draw interval or prizes
 *                 beside a preset, and a speed without a preset are refused; a retired preset
 *                 is unavailable. The admin changes the Organizer part on the Presets page; a
 *                 speed outside the mode's range is refused. Matches it opened are aborted.
 * Depends on:     vitest, ./harness, ./session
 * Spec:           docs/concepts/admin-area.md §3, §4 (Presets), §8 (g), (h), §9 piece 4
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

interface OrganizerPreset {
  id: string;
  name: string;
  speedsMs: { relaxed: number; normal: number; quick: number };
  players: { min: number; max: number; start: number };
  starts: { now: boolean; at: boolean; whenFull: boolean };
}

const FROM_PRESET = {
  title: 'From a preset',
  gameType: 'royale',
  preset: 'royale-realtime',
  speed: 'quick',
  drawMode: 'auto',
  missedNumbers: { kind: 'noAutoMark' },
  maxPlayers: 30,
};

const create = (body: object) => host.post('/api/v1/matches', { ...FROM_PRESET, ...body });
const setValues = (id: string, values: object) =>
  admin.post(`/api/v1/admin/presets/${id}`, { values });

describe('the Organizer starts a match from a preset (admin-area §3)', () => {
  it('lists the published presets with their Organizer part, not their rules', async () => {
    const r = await host.get('/api/v1/presets');
    expect(r.statusCode).toBe(200);
    const list = r.json<{ presets: (OrganizerPreset & Record<string, unknown>)[] }>().presets;
    // Live presets first: the page preselects the first of a game type.
    expect(list.map((p) => p.id)).toEqual([
      'classic-realtime',
      'classic-seasons-realtime',
      'royale-realtime',
      'royale-async',
    ]);
    const royale = list.find((p) => p.id === 'royale-realtime');
    expect(royale).toMatchObject({
      name: 'Battle royale',
      speedsMs: { relaxed: 8_000, normal: 5_000, quick: 4_000 },
      players: { min: 2, max: 200, start: 20 },
    });
    expect(royale?.['ruleset']).toBeUndefined();
  });

  it('freezes the preset, its id and the chosen speed', async () => {
    const r = await create({});
    expect(r.statusCode).toBe(201);
    const row = await h.pool.query<{ draw_interval_ms: number; ruleset_name: string }>(
      'SELECT draw_interval_ms, ruleset_name FROM sbr.matches WHERE code = $1',
      [r.json<{ code: string }>().code],
    );
    expect(row.rows[0]).toEqual({ draw_interval_ms: 4_000, ruleset_name: 'royale-realtime' });
  });

  it('refuses what the preset decides or does not allow', async () => {
    expect((await create({ maxPlayers: 201 })).statusCode).toBe(400);
    expect((await create({ drawIntervalMs: 9_000 })).statusCode).toBe(400);
    expect((await create({ gameType: 'classic' })).statusCode).toBe(400);
    const { preset: _p, ...plain } = FROM_PRESET;
    expect((await host.post('/api/v1/matches', plain)).statusCode).toBe(400);
    expect((await setValues('royale-realtime', { 'organizer.players.max': 24 })).statusCode).toBe(
      200,
    );
    expect((await create({})).statusCode).toBe(400);
    expect(
      (await setValues('royale-realtime', { 'organizer.starts.whenFull': false })).statusCode,
    ).toBe(200);
    expect((await create({ maxPlayers: 20, startRule: { kind: 'whenFull' } })).statusCode).toBe(
      400,
    );
  });
});

describe('the Organizer part on the Presets page (admin-area §4)', () => {
  it('keeps each speed inside the mode and refuses a retired preset', async () => {
    expect(
      (await setValues('royale-realtime', { 'organizer.speedsMs.quick': 600_000 })).statusCode,
    ).toBe(400);
    expect(
      (await setValues('royale-realtime', { 'organizer.speedsMs.quick': 6_000 })).statusCode,
    ).toBe(200);
    const copy = await admin.post('/api/v1/admin/presets/royale-realtime/duplicate', {
      name: 'Royale copy',
    });
    const id = copy.json<{ preset: { id: string } }>().preset.id;
    expect((await create({ preset: id, maxPlayers: 20 })).statusCode).toBe(409);
    const quick = await create({ maxPlayers: 20 });
    const row = await h.pool.query<{ draw_interval_ms: number }>(
      'SELECT draw_interval_ms FROM sbr.matches WHERE code = $1',
      [quick.json<{ code: string }>().code],
    );
    expect(row.rows[0]?.draw_interval_ms).toBe(6_000);
  });
});
