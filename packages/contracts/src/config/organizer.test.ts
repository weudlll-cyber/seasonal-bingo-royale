/**
 * @file   packages/contracts/src/config/organizer.test.ts
 * @module contracts/config
 * @brief  A preset's part for the Organizer: defaults from the ruleset, fields, speed checks.
 *
 * Spec:   docs/concepts/admin-area.md §3, §4 (Presets), §8 (h), §9 piece 4
 */
import { describe, expect, it } from 'vitest';

import { royaleAsyncDefault } from './defaults/royaleAsync.js';
import { royaleRealtimeDefault } from './defaults/royaleRealtime.js';
import { OrganizerSchema, organizerDefaults, speedProblem } from './organizer.js';
import { presetFields } from './presetFields.js';

describe('the Organizer part of a preset', () => {
  it('starts from today: the ruleset interval as normal, 2 to 200 players, every start', () => {
    const live = organizerDefaults(royaleRealtimeDefault);
    expect(live.speedsMs).toEqual({ relaxed: 8_000, normal: 5_000, quick: 4_000 });
    expect(live.players).toEqual({ min: 2, max: 200, start: 20 });
    expect(live.starts).toEqual({ now: true, at: true, whenFull: true });
    expect(organizerDefaults(royaleAsyncDefault).speedsMs).toEqual({
      relaxed: 30 * 60_000,
      normal: 15 * 60_000,
      quick: 5 * 60_000,
    });
    expect(OrganizerSchema.safeParse(live).success).toBe(true);
  });

  it('refuses a start value outside its range and a preset without any start', () => {
    const o = organizerDefaults(royaleRealtimeDefault);
    expect(
      OrganizerSchema.safeParse({ ...o, players: { min: 10, max: 20, start: 5 } }).success,
    ).toBe(false);
    expect(
      OrganizerSchema.safeParse({ ...o, starts: { now: false, at: false, whenFull: false } })
        .success,
    ).toBe(false);
  });

  it('checks a speed against the mode and the shortest interval (D12)', () => {
    expect(speedProblem(royaleRealtimeDefault, 4_000)).toBeNull();
    expect(speedProblem(royaleRealtimeDefault, 3_000)).not.toBeNull();
    expect(speedProblem(royaleAsyncDefault, 5_000)).not.toBeNull();
  });

  it('gets fields in the tab "organizer", speeds in minutes for an asynchronous preset', () => {
    const live = presetFields(royaleRealtimeDefault, organizerDefaults(royaleRealtimeDefault));
    const own = live.filter((f) => f.tab === 'organizer');
    expect(own.map((f) => f.path)).toContain('organizer.players.max');
    expect(own.find((f) => f.path === 'organizer.description')).toMatchObject({
      kind: 'text',
      max: 120,
    });
    expect(own.find((f) => f.path === 'organizer.speedsMs.quick')).toMatchObject({
      unit: 's',
      scale: 1000,
      min: 4_000,
      max: 60_000,
    });
    const away = presetFields(royaleAsyncDefault, organizerDefaults(royaleAsyncDefault));
    expect(away.find((f) => f.path === 'organizer.speedsMs.quick')).toMatchObject({
      unit: 'min',
      scale: 60_000,
    });
    expect(presetFields(royaleRealtimeDefault).some((f) => f.tab === 'organizer')).toBe(false);
  });
});
