/**
 * @file   e2e/showcase.spec.ts
 * @module e2e
 * @brief  The four showcase seeds show what the morning sheet promises (RUN-3 step 4c).
 *
 * Responsibility: play each showcase seed with its exact settings to the end, assert the
 *                 promised moment on the page and save a full-page screenshot to
 *                 reports/screens/run-3/<seed>.png (Chromium only, one file per seed).
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
    path: `${REPO_ROOT}reports/screens/run-3/${seed}.png`,
    fullPage: true,
  });
}

test('showcase-41: Season Complete for owner-01 in round 1 (royale)', async ({ page }, info) => {
  await finalPlacement(page, { ...ROYALE, seed: 'showcase-41' });
  await expect(page.getByTestId('match-log')).toContainText(
    'Season Complete fired for owner-01 in round 1!',
  );
  await screenshot(page, info, 'showcase-41');
});

test('showcase-18: the Winter shield saves owner-01 at the first cut (royale)', async ({
  page,
}, info) => {
  await finalPlacement(page, { ...ROYALE, seed: 'showcase-18' });
  await expect(
    page.getByTestId('match-log').getByText(/^Cut 1: .*owner-01: saved by the Winter shield/),
  ).toBeVisible();
  await screenshot(page, info, 'showcase-18');
});

test('showcase-69: three players share rows-1 on draw 37 (classicSeasons)', async ({
  page,
}, info) => {
  await finalPlacement(page, {
    gameType: 'classicSeasons',
    seed: 'showcase-69',
    bots: 20,
    marking: 'auto',
  });
  const rows1 = page.getByTestId('prize-rows-1');
  await expect(rows1).toHaveText(/^rows-1: won on draw 37 by [\w-]+, [\w-]+, [\w-]+$/);
  await screenshot(page, info, 'showcase-69');
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
  await expect(page.getByTestId('prize-fullCard')).toContainText('won on draw 75');
  await screenshot(page, info, 'showcase-273');
});
