/**
 * @file   e2e/layout.spec.ts
 * @module e2e
 * @brief  The page column keeps its width whether or not the page needs a scrollbar.
 *
 * Responsibility: at 900 px, where the column fills the window, the Quick Test page in a
 *                 tall window (no scrollbar) and in a short one (scrollbar) gives the same
 *                 column width (`scrollbar-gutter: stable`, POLISH-1 review finding 4).
 *                 Headless browsers hide scrollbars by default; this file shows them.
 * Depends on:     @playwright/test
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, test } from '@playwright/test';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('the page column keeps its width with and without a scrollbar', async ({ page }) => {
  const columnWidth = () =>
    page.evaluate(() => document.querySelector('.shell-main')?.getBoundingClientRect().width ?? 0);
  await page.setViewportSize({ width: 900, height: 2400 });
  await page.goto('/#/quicktest');
  await expect(page.getByTestId('start-run')).toBeVisible();
  const tall = await columnWidth();
  await page.setViewportSize({ width: 900, height: 400 });
  expect(await columnWidth(), 'same width with a scrollbar').toBe(tall);
});
