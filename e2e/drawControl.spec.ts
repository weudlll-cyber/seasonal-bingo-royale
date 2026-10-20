/**
 * @file   e2e/drawControl.spec.ts
 * @module e2e
 * @brief  Host draw control in the browser (D8): Draw next, then switch to timed draws.
 *
 * Responsibility: in `host` mode no number appears until "Draw next" is pressed, then
 *                 exactly one; after switching to 'Timed draws' the next number follows
 *                 after the set interval, not at once.
 * Depends on:     @playwright/test, ./quickTest
 * Spec:           docs/spec/01-game-design.md §5; docs/spec/15-implementation-plan.md WP-08
 */
import { expect, test, type Page } from '@playwright/test';

import { startRun } from './quickTest.js';

const INTERVAL_SEC = 2;

const shown = (page: Page): Promise<number> =>
  page.getByTestId('draw-ticker').locator(':scope > *').count();

test('host draws happen only on Draw next; timed draws resume at the set interval', async ({
  page,
}) => {
  await startRun(page, {
    gameType: 'classic',
    seed: 'e2e-host',
    bots: 3,
    marking: 'auto',
    drawMode: 'host',
    intervalSec: INTERVAL_SEC,
  });
  // Longer than the interval: in host mode nothing is drawn on its own.
  await page.waitForTimeout((INTERVAL_SEC + 1) * 1000);
  expect(await shown(page)).toBe(0);

  await page.getByTestId('draw-next').click();
  expect(await shown(page)).toBe(1);
  await page.waitForTimeout((INTERVAL_SEC + 1) * 1000);
  expect(await shown(page)).toBe(1);

  const switchedAt = Date.now();
  await page.getByTestId('draw-mode-timed').click();
  await expect.poll(() => shown(page), { timeout: 10_000, intervals: [100] }).toBe(2);
  const waited = Date.now() - switchedAt;
  expect(waited).toBeGreaterThanOrEqual(INTERVAL_SEC * 1000 - 300);
  expect(waited).toBeLessThan(INTERVAL_SEC * 1000 + 3000);
  await expect(page.getByTestId('draw-next')).toBeDisabled();
});
