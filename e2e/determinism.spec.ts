/**
 * @file   e2e/determinism.spec.ts
 * @module e2e
 * @brief  The same seed gives the same final ranking twice, per game type (WP-08 Accept).
 *
 * Responsibility: in `auto` mode, play one match per game type to the end twice with the
 *                 same seed and settings and compare the final placement shown.
 * Depends on:     @playwright/test, ./quickTest
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/12-testing-strategy.md §3 inv. 2
 */
import { expect, test } from '@playwright/test';

import { finalPlacement, type RunSettings } from './quickTest.js';

const GAME_TYPES = ['royale', 'classicSeasons', 'classic'] as const;

for (const gameType of GAME_TYPES) {
  test(`${gameType}: a fixed seed in auto mode gives the same final ranking twice`, async ({
    page,
  }) => {
    const settings: RunSettings = { gameType, seed: 'e2e-determinism', bots: 12, marking: 'auto' };
    const first = await finalPlacement(page, settings);
    const second = await finalPlacement(page, settings);
    expect(first).toMatch(/You finished #\d+ of 13/);
    expect(second).toBe(first);
  });
}
