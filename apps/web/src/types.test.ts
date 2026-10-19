/**
 * @file   apps/web/src/types.test.ts
 * @module web
 * @brief  Smoke test for the player client — type shape and barrel export (WP-08).
 *
 * Responsibility: verify the barrel exposes the package name and the shared types are
 *                 shaped the way the server's `/dev/quicktest` response expects. More
 *                 behaviour-level checks sit on the server side (quicktest returns a
 *                 valid simulation); the player client is covered by the manual
 *                 acceptance step described in the morning sheet.
 * Depends on:     ./index
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';
import { SEASON_NAMES, SEASON_SYMBOLS } from './types.js';

describe('@sbr/web barrel', () => {
  it('is importable and exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@sbr/web');
  });

  it('maps the four season symbol ids to the right display order', () => {
    expect(SEASON_NAMES).toEqual(['spring', 'summer', 'autumn', 'winter']);
    for (const id of [101, 102, 103, 104]) {
      expect(SEASON_SYMBOLS[id]).toBeTruthy();
    }
  });
});
