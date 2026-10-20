/**
 * @file   e2e/missedNumbers.spec.ts
 * @module e2e
 * @brief  Missed numbers and per-player marking in the browser (01 §6, D9).
 *
 * Responsibility: with host draws, so time passes without new numbers: under "leave
 *                 open" an untapped drawn number stays unmarked and a later tap marks it
 *                 without bonus; under "mark for me after 5 seconds" it is marked after
 *                 5 s, not after 3 s. With timed draws while the owner taps, bots score
 *                 from the first draws on (bug report 2026-10-20: nobody scored).
 * Depends on:     @playwright/test, ./quickTest
 * Spec:           docs/spec/01-game-design.md §6; docs/spec/12-testing-strategy.md §3 inv. 17, 18
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { startRun } from './quickTest.js';

// Host mode: press Draw next until one of the owner's numbers is drawn; returns its cell.
async function drawOwnerNumber(page: Page): Promise<Locator> {
  for (let press = 0; press < 40; press += 1) {
    await page.getByTestId('draw-next').click();
    const item = await page.getByTestId('draw-newest').getAttribute('data-item');
    const cell = page.locator(`[data-testid^="owner-cell-"][data-value="${item ?? ''}"]`);
    if ((await cell.count()) > 0) return cell;
  }
  throw new Error('no owner number in 40 draws');
}

test('leave open: a missed number stays open and a later tap marks it without bonus', async ({
  page,
}) => {
  await startRun(page, {
    gameType: 'classic',
    seed: 'e2e-open',
    bots: 3,
    marking: 'manual',
    missed: 'noAutoMark',
    drawMode: 'host',
  });
  const cell = await drawOwnerNumber(page);
  await page.waitForTimeout(6_000); // past the 3 s window and the default delay
  await expect(cell).toHaveAttribute('data-marked', 'false');
  await cell.click();
  await expect(cell).toHaveAttribute('data-marked', 'true');
  await expect(page.getByTestId('owner-feedback')).toHaveText('Marked late · no speed bonus');
  await expect(page.getByTestId('owner-bonus')).toHaveText(
    '+0 speed bonus (not counted in Quick Test cuts)',
  );
});

test('mark for me after 5 seconds: a missed number is marked after 5 s, not 3 s', async ({
  page,
}) => {
  await startRun(page, {
    gameType: 'classic',
    seed: 'e2e-after-5',
    bots: 3,
    marking: 'manual',
    missed: 'autoMarkAfter',
    missedDelaySec: 5,
    drawMode: 'host',
  });
  const cell = await drawOwnerNumber(page);
  const drawnAt = Date.now();
  await page.waitForTimeout(4_000);
  await expect(cell).toHaveAttribute('data-marked', 'false');
  await expect(cell).toHaveAttribute('data-marked', 'true', { timeout: 3_000 });
  expect(Date.now() - drawnAt).toBeGreaterThanOrEqual(4_900);
  await expect(page.getByTestId('owner-feedback')).toHaveText(
    'Marked 1 for you without bonus (after 5 s)',
  );
});

test('while the owner taps, bots score from the first draws on', async ({ page }) => {
  await startRun(page, {
    gameType: 'royale',
    seed: 'probe-1',
    bots: 20,
    marking: 'manual',
    drawMode: 'host',
  });
  for (let press = 0; press < 6; press += 1) await page.getByTestId('draw-next').click();
  const botPoints = await page
    .locator('[data-testid^="standing-bot-"]')
    .evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('data-points'))));
  expect(botPoints.length).toBeGreaterThan(0);
  expect(botPoints.some((p) => p > 0)).toBe(true);
});
