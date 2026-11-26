/**
 * @file   e2e/topBar.spec.ts
 * @module e2e
 * @brief  The top bar always takes one row: what does not fit folds into the menu button.
 *
 * Responsibility: below 960 px folded even when the items fit (a guest at 940 px with a 10 px
 *                 root font), at 1280 px that guest's bar unfolded with no Menu button. Signed in as
 *                 the owner (`dev-owner`: every navigation item and the longest
 *                 chip), at 960, 1024, 1100, 1280 and 1366 px, light and dark, no item of the bar
 *                 sits below another (one row); where the items do not fit, the menu button is
 *                 there instead, and it opens the navigation and the account. Chromium saves
 *                 admin-fix-topbar-<width>-light|dark.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/concepts/fit-audit.md (O1); owner's fault list of 2026-11-21 (a)
 */
import { expect, test, type Page } from '@playwright/test';
import { setTheme } from '@seasonal/kit/testing';

import { closeContexts, signIn } from './realGame.js';
import { SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const WIDTHS = [960, 1024, 1100, 1280, 1366];

// The bar's visible items as boxes: one row means no item starts below another's bottom.
async function rows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bar = document.querySelector('.sk-header');
    if (bar === null) return 0;
    const items = [...bar.children, ...(bar.querySelector('.sk-menu')?.children ?? [])].filter(
      (e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && getComputedStyle(e).display !== 'contents';
      },
    );
    const boxes = items.map((e) => e.getBoundingClientRect());
    const firstBottom = Math.min(...boxes.map((b) => b.bottom));
    return boxes.some((b) => b.top >= firstBottom - 1) ? 2 : 1;
  });
}

test('the top bar takes one row at 960 to 1366 px, folding what does not fit', async ({
  browser,
}, info) => {
  const shots = info.project.name.startsWith('chromium');
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'owner');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await expect.poll(() => rows(page), `${String(width)} px ${theme}`).toBe(1);
      if (shots)
        await page.screenshot({
          path: `${SHOTS_DIR}/admin-fix-topbar-${String(width)}-${theme}.jpg`,
          quality: 75,
          clip: { x: 0, y: 0, width, height: 160 },
        });
    }
    // Folded or not, the navigation is reachable.
    const menu = page.getByTestId('menu-button');
    if (await menu.isVisible()) {
      await menu.click();
      await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
      await menu.click();
    } else {
      await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
    }
  }
});

// Below 960 px the bar is always folded, as before the kit's header (header.css), even when its
// items would fit: at 940 px with a 10 px root font the development bar fits on one row, and
// still shows brand, toggle and Menu. Wide, the bar shows its items and no Menu button.
test('the bar folds below 960 px even when its items fit, and shows no Menu unfolded', async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 940, height: 700 } })
  ).newPage();
  await page.goto('/#/');
  await expect(page.locator('[data-session="known"]')).toBeAttached({ timeout: 20_000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '10px';
  });
  // A new route: the kit's header tries one row again (its close key), and its items fit.
  await page.goto('/#/leaderboard');
  await expect(page.getByTestId('menu-button')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  expect(await rows(page)).toBe(1);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByTestId('menu-button')).toBeHidden();
  expect(await rows(page)).toBe(1);
});
