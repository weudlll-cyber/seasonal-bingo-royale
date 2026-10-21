/**
 * @file   e2e/screens.ts
 * @module e2e
 * @brief  Screenshots for the reports: the viewport in the light and in the dark theme.
 *
 * Responsibility: save what a person sees in the browser window (the viewport) in both
 *                 themes; the theme is switched on <html> in place, as the toggle does, so
 *                 a running match is not reloaded, and the page's own theme is put back.
 *                 `captureLook` adds the desktop (1280×800) and phone (390×844) size.
 * Depends on:     @playwright/test, node:path
 * Used by:        ./hostNav.spec.ts, ./acceptance/realGame.spec.ts
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/spec/01-game-design.md §13
 */
import path from 'node:path';

import type { Page } from '@playwright/test';

export const DESKTOP = { width: 1280, height: 800 };
export const PHONE = { width: 390, height: 844 };

// <name>-light.jpg and <name>-dark.jpg.
export async function captureThemes(page: Page, dir: string, name: string): Promise<void> {
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.jpg`), quality: 75 });
  }
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t ?? 'light');
  }, before);
}

// Both sizes and both themes: <name>-desktop-light.jpg … <name>-phone-dark.jpg.
export async function captureLook(page: Page, dir: string, name: string): Promise<void> {
  const before = page.viewportSize() ?? DESKTOP;
  await page.setViewportSize(DESKTOP);
  await captureThemes(page, dir, `${name}-desktop`);
  await page.setViewportSize(PHONE);
  await captureThemes(page, dir, `${name}-phone`);
  await page.setViewportSize(before);
}
