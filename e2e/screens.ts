/**
 * @file   e2e/screens.ts
 * @module e2e
 * @brief  Screenshots for the reports: the viewport in the light and in the dark theme.
 *
 * Responsibility: save what a person sees in the browser window (the viewport) in both
 *                 themes, switched with the top bar's own toggle (no reload, so a running
 *                 match goes on); the page's theme is put back afterwards.
 *                 `captureLook` adds the desktop (1280×800) and phone (390×844) size, and can
 *                 bring one element into view first.
 * Depends on:     @playwright/test, node:path, ./devStack
 * Used by:        ./hostNav.spec.ts, ./acceptance/realGame.spec.ts, ./account.spec,
 *                 ./createFormPhone.spec, ./startScreens.spec
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/spec/01-game-design.md §13
 */
import path from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';

// Where the latest run's screenshots go (git-ignored; every run replaces them).
export const SHOTS_DIR = path.join(REPO_ROOT, 'reports', 'screens', 'latest');

export const DESKTOP = { width: 1280, height: 800 };
export const PHONE = { width: 390, height: 844 };

const themeNow = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// Presses the top bar's toggle until <html> carries the theme (the icon follows).
async function setTheme(page: Page, theme: string): Promise<void> {
  if ((await themeNow(page)) !== theme) await page.getByTestId('theme-toggle').click();
  await expect.poll(() => themeNow(page)).toBe(theme);
  // Buttons fade their background (160 ms): the picture waits until the fade is done.
  await page.waitForTimeout(400);
}

// <name>-light.jpg and <name>-dark.jpg. `show`, when given, is brought to the middle of the
// window after each theme switch (the toggle's click scrolls the page to the top bar).
export async function captureThemes(
  page: Page,
  dir: string,
  name: string,
  show?: Locator,
): Promise<void> {
  const before = (await themeNow(page)) ?? 'light';
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await show?.evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
    });
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.jpg`), quality: 75 });
  }
  await setTheme(page, before);
}

// Both sizes and both themes: <name>-desktop-light.jpg … <name>-phone-dark.jpg; `show` as above.
export async function captureLook(
  page: Page,
  dir: string,
  name: string,
  show?: Locator,
): Promise<void> {
  const before = page.viewportSize() ?? DESKTOP;
  await page.setViewportSize(DESKTOP);
  await captureThemes(page, dir, `${name}-desktop`, show);
  await page.setViewportSize(PHONE);
  await captureThemes(page, dir, `${name}-phone`, show);
  await page.setViewportSize(before);
}
