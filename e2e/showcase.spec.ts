/**
 * @file   e2e/showcase.spec.ts
 * @module e2e
 * @brief  The four showcase seeds show what the morning sheet promises (RUN-4 step 7).
 *
 * Responsibility: play each showcase seed with its exact settings to the end, assert the
 *                 promised moment on the page and save a full-page screenshot to
 *                 reports/screens/latest/showcase/<seed>.png (Chromium only, one file per seed).
 *                 The seeds were searched again after the sorted cards (D7) and the stage
 *                 multiplier changed every card and royale score.
 * Depends on:     @playwright/test, ./devStack, ./quickTest
 * Spec:           docs/spec/15-implementation-plan.md WP-08; reports/run-2026-10-20-day.md
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';
import { finalPlacement, type RunSettings } from './quickTest.js';

const ROYALE: Omit<RunSettings, 'seed'> = { gameType: 'royale', bots: 20, marking: 'auto' };

async function screenshot(page: Page, testInfo: TestInfo, seed: string): Promise<void> {
  if (testInfo.project.name !== 'chromium') return;
  await page.screenshot({
    path: `${REPO_ROOT}reports/screens/latest/showcase/${seed}.png`,
    fullPage: true,
  });
}

test('showcase-10: Season Complete for owner-01 in round 1 (royale)', async ({ page }, info) => {
  await finalPlacement(page, { ...ROYALE, seed: 'showcase-10' });
  // Newest first: the oldest lines close the log; Season Complete came before round 1 ended.
  const log = page.getByTestId('match-log').locator('li');
  await expect(log.last()).toHaveText('owner-01 collected all four seasons');
  await expect(log.nth(-2)).toHaveText(/^Round 1 over/);
  await screenshot(page, info, 'showcase-10');
});

test('showcase-4: the Winter shield saves owner-01 at the first cut (royale)', async ({
  page,
}, info) => {
  await finalPlacement(page, { ...ROYALE, seed: 'showcase-4' });
  await expect(
    page
      .getByTestId('match-log')
      .getByText(/^Cut 1: .*owner-01 is through, saved by the Winter shield/),
  ).toBeVisible();
  await screenshot(page, info, 'showcase-4');
});

test('showcase-32: three players share fourCorners on draw 53 (classicSeasons)', async ({
  page,
}, info) => {
  await finalPlacement(page, {
    gameType: 'classicSeasons',
    seed: 'showcase-32',
    bots: 20,
    marking: 'auto',
  });
  await expect(page.getByTestId('prize-fourCorners')).toHaveText(
    /^Four corners[\w-]+, [\w-]+, [\w-]+ · draw 53 \([^)]+\)$/,
  );
  await screenshot(page, info, 'showcase-32');
});

test('showcase-273: fullCard only, decided on the last of 75 draws (classic)', async ({
  page,
}, info) => {
  await finalPlacement(page, {
    gameType: 'classic',
    seed: 'showcase-273',
    bots: 4,
    marking: 'auto',
    prizes: ['fullCard'],
  });
  await expect(page.getByTestId('stage-banner')).toContainText('draw 75 / 75');
  await expect(page.getByTestId('prize-fullCard')).toContainText('· draw 75 (');
  await screenshot(page, info, 'showcase-273');
});
