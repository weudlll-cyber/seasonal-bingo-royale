/**
 * @file   e2e/newRun.spec.ts
 * @module e2e
 * @brief  A new run on the same page starts with a fresh owner card (owner report 2026-10-20).
 *
 * Responsibility: play a few draws in manual mode and mark a number, then press Run Quick
 *                 Test again with a different seed (no page reload) and check the card
 *                 shows only the free centre plus numbers drawn in the new run.
 * Depends on:     @playwright/test, ./quickTest
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { expect, test, type Page } from '@playwright/test';

import { startRun } from './quickTest.js';

const MISSED_DELAY_MS = 3_000; // default missed-number delay (01 §6)

// Values of the owner's marked cells (the free centre has no value) and the drawn items.
async function cardState(page: Page): Promise<{ marked: string[]; drawn: string[] }> {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll<HTMLElement>('[data-testid^="owner-cell-"]')];
    const ticker = document.querySelector('[data-testid="draw-ticker"]');
    return {
      marked: cells
        .filter((c) => c.dataset['marked'] === 'true')
        .map((c) => c.dataset['value'] ?? ''),
      drawn: [...(ticker?.children ?? [])].map((el) => (el as HTMLElement).dataset['item'] ?? ''),
    };
  });
}

// Host mode: press Draw next until one of the owner's numbers is drawn, then tap it.
async function drawAndMarkOne(page: Page): Promise<void> {
  for (let press = 0; press < 40; press += 1) {
    await page.getByTestId('draw-next').click();
    const item = await page.getByTestId('draw-newest').getAttribute('data-item');
    const cell = page.locator(`[data-testid^="owner-cell-"][data-value="${item ?? ''}"]`);
    if ((await cell.count()) > 0) {
      await cell.click();
      await expect(cell).toHaveAttribute('data-marked', 'true');
      return;
    }
  }
  throw new Error('no owner number in 40 draws');
}

test('a new run on the same page starts with a fresh owner card', async ({ page }) => {
  await startRun(page, {
    gameType: 'classic',
    seed: 'e2e-run-a',
    bots: 3,
    marking: 'manual',
    drawMode: 'host',
  });
  await drawAndMarkOne(page);
  await page.getByTestId('draw-next').click();
  await page.getByTestId('draw-next').click();
  expect((await cardState(page)).marked.length).toBeGreaterThan(1);

  // Run B on the same page: new seed, Run Quick Test again — no reload.
  await page.getByTestId('seed').fill('e2e-run-b');
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('draw-ticker').locator(':scope > *')).toHaveCount(0);
  expect((await cardState(page)).marked).toEqual(['']); // only the free centre
  await expect(page.getByTestId('owner-bonus')).toHaveText(
    '+0 speed bonus (not counted in Quick Test cuts)',
  );

  await page.getByTestId('draw-next').click();
  await page.getByTestId('draw-next').click();
  await page.waitForTimeout(MISSED_DELAY_MS + 500); // missed numbers are marked for the owner
  const { marked, drawn } = await cardState(page);
  expect(drawn).toHaveLength(2);
  for (const value of marked) expect(['', ...drawn]).toContain(value);
});
