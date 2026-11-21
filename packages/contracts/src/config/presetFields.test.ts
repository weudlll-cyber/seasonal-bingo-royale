/**
 * @file   packages/contracts/src/config/presetFields.test.ts
 * @module contracts/config
 * @brief  The preset fields follow the ruleset and take their limits from its schema.
 *
 * Spec:   docs/concepts/admin-area.md §4 (Presets), §8 (r), §9 piece 3
 */
import { describe, expect, it } from 'vitest';

import { classicRealtimeDefault } from './defaults/classicRealtime.js';
import { royaleAsyncDefault } from './defaults/royaleAsync.js';
import { royaleRealtimeDefault } from './defaults/royaleRealtime.js';
import { presetFields, presetPathName, readPath, writePath } from './presetFields.js';

const byPath = (fields: ReturnType<typeof presetFields>) => new Map(fields.map((f) => [f.path, f]));

describe('presetFields', () => {
  it('takes min and max from the schema and shows milliseconds as seconds', () => {
    const f = byPath(presetFields(royaleRealtimeDefault)).get('draws.intervalMsRealtime');
    expect(f).toMatchObject({
      tab: 'draws',
      kind: 'number',
      min: 2_000,
      max: 60_000,
      unit: 's',
      scale: 1000,
    });
  });

  it('lists one field per stage and the current effect of each season', () => {
    const fields = byPath(presetFields(royaleRealtimeDefault));
    const stages = royaleRealtimeDefault.stages ?? [];
    for (const [i] of stages.entries())
      expect(fields.get(`stages.${String(i)}.rounds`)).toMatchObject({ min: 1, max: 10 });
    const spring = royaleRealtimeDefault.seasons.spring.effect;
    const own = [...fields.keys()].filter((p) => p.startsWith('seasons.spring.effect.'));
    expect(own.map((p) => p.split('.').at(-1)).sort()).toEqual(
      Object.keys(spring)
        .filter((k) => k !== 'type')
        .sort(),
    );
  });

  it('offers choices with their options and leaves out what the game does not read', () => {
    const fields = byPath(presetFields(royaleRealtimeDefault));
    expect(fields.get('marking.mode')).toMatchObject({
      kind: 'choice',
      options: ['auto', 'manual'],
    });
    for (const unread of [
      'lobby.maxPlayers',
      'lobby.openMsRealtime',
      'lobby.startRule',
      'lobby.lateJoin',
    ])
      expect(fields.has(unread)).toBe(false);
  });

  it('offers only the values the mode of the preset reads', () => {
    const live = byPath(presetFields(royaleRealtimeDefault));
    const away = byPath(presetFields(royaleAsyncDefault));
    expect([live.has('draws.intervalMsRealtime'), live.has('draws.intervalMsAsync')]).toEqual([
      true,
      false,
    ]);
    expect(live.has('lobby.openMsAsync')).toBe(false);
    expect([away.has('draws.intervalMsRealtime'), away.has('draws.intervalMsAsync')]).toEqual([
      false,
      true,
    ]);
    expect(away.get('lobby.openMsAsync')).toMatchObject({ unit: 'h', scale: 3_600_000 });
  });
});

describe('presetFields by kind of ruleset', () => {
  it('has no stage or jackpot fields for a classic ruleset', () => {
    const paths = presetFields(classicRealtimeDefault).map((f) => f.path);
    expect(paths.some((p) => p.startsWith('stages.') || p.startsWith('jackpot.'))).toBe(false);
    expect(paths).toContain('scoring.pointsPerMark');
  });
});

describe('readPath, writePath and presetPathName', () => {
  it('reads and writes one path without changing the original', () => {
    const next = writePath(royaleRealtimeDefault, 'stages.0.rounds', 7);
    expect(readPath(next, 'stages.0.rounds')).toBe(7);
    expect(readPath(royaleRealtimeDefault, 'stages.0.rounds')).not.toBe(7);
    expect(Array.isArray(readPath(next, 'stages'))).toBe(true);
  });

  it('names a path for the History, stages and seasons included', () => {
    expect(presetPathName('stages.1.rounds')).toEqual({
      label: 'Rounds',
      unit: 'rounds',
      scale: 1,
    });
    expect(presetPathName('seasons.winter.effect.factor')?.label).toBe('Multiplier');
    expect(presetPathName('draws.intervalMsRealtime')).toMatchObject({ unit: 's', scale: 1000 });
    expect(presetPathName('lobby.maxPlayers')).toBeNull();
  });
});
