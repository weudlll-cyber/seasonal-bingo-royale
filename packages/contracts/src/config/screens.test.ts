/**
 * @file   packages/contracts/src/config/screens.test.ts
 * @module contracts/config
 * @brief  "Screens and texts": today's values by default, bounds from the schema, the client part.
 *
 * Spec:   docs/concepts/admin-area.md §4, §8 (i), §9 piece 6
 */
import { describe, expect, it } from 'vitest';

import {
  CLIENT_SCREEN_KEYS,
  clientScreensOf,
  SCREEN_CATALOGUE,
  SCREEN_DEFAULTS,
  screenSettingsOf,
  ScreenSettingsSchema,
} from './screens.js';
import { settingsFields } from './settingsFields.js';

describe('the screen values (admin-area §8 (i))', () => {
  it('are today’s values when nothing is changed, a stored one over the default', () => {
    expect(screenSettingsOf({})).toEqual(SCREEN_DEFAULTS);
    expect(screenSettingsOf({ standingsRows: 30 }).standingsRows).toBe(30);
    expect(screenSettingsOf({ standingsRows: 2 })).toEqual(SCREEN_DEFAULTS);
  });

  it('send the client only its own values', () => {
    expect(Object.keys(clientScreensOf(SCREEN_DEFAULTS)).sort()).toEqual(
      [...CLIENT_SCREEN_KEYS].sort(),
    );
    expect(clientScreensOf(SCREEN_DEFAULTS)).not.toHaveProperty('matchList');
  });

  it('get their fields with the bounds of the schema, times in seconds', () => {
    const fields = settingsFields(ScreenSettingsSchema, SCREEN_DEFAULTS, SCREEN_CATALOGUE);
    expect(fields).toHaveLength(Object.keys(SCREEN_DEFAULTS).length);
    expect(fields.find((f) => f.path === 'recapCardMs')).toMatchObject({
      min: 3_000,
      max: 15_000,
      unit: 's',
      scale: 1000,
    });
  });
});
