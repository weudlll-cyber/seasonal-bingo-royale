/**
 * @file   e2e/screens.ts
 * @module e2e
 * @brief  Where the reports' screenshots go, and both themes at the window's own size.
 *
 * Responsibility: `SHOTS_DIR` and `captureThemes`: what a person sees in the browser window (the
 *                 viewport) in both themes, switched without a reload (so a running match goes
 *                 on); the page's theme is put back afterwards. The theme switch and the desktop
 *                 and phone pictures are the kit's (`setTheme`, `captureLook` of
 *                 @seasonal/kit/testing).
 * Depends on:     @playwright/test, @seasonal/kit/testing, ./devStack
 * Used by:        the Playwright specs (test helper)
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/spec/01-game-design.md §13
 */
import path from 'node:path';

import type { Locator, Page } from '@playwright/test';
import { setTheme, type Theme } from '@seasonal/kit/testing';

import { REPO_ROOT } from './devStack.js';

// Where the latest run's screenshots go (git-ignored; every run replaces them).
export const SHOTS_DIR = path.join(REPO_ROOT, 'reports', 'screens', 'latest');

// <name>-light.jpg and <name>-dark.jpg at the window's own size. `show`, when given, is brought
// to the middle of the window after each theme switch (the toggle's click scrolls the page to
// the top bar).
export async function captureThemes(
  page: Page,
  dir: string,
  name: string,
  show?: Locator,
): Promise<void> {
  const before: Theme =
    (await page.locator('html').getAttribute('data-theme')) === 'dark' ? 'dark' : 'light';
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await show?.evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
    });
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.jpg`), quality: 75 });
  }
  await setTheme(page, before);
}
