/**
 * @file   e2e/screens.ts
 * @module e2e
 * @brief  Screenshots for the reports: a viewport shot and a full-page shot of a screen.
 *
 * Responsibility: save what a person sees in the browser window (the viewport) and the
 *                 whole page. For the full-page shot the top bar is made non-sticky during
 *                 the capture only, so it does not appear in the middle of a stitched
 *                 page; the page itself is left as it was.
 * Depends on:     @playwright/test, node:path
 * Used by:        ./hostNav.spec.ts, ./acceptance/realGame.spec.ts
 * Spec:           docs/spec/12-testing-strategy.md §4
 */
import path from 'node:path';

import type { Page } from '@playwright/test';

export const DESKTOP = { width: 1280, height: 800 };
export const PHONE = { width: 390, height: 844 };

// Saves <name>-view.jpg and <name>-full.jpg into dir.
export async function capture(page: Page, dir: string, name: string): Promise<void> {
  await page.screenshot({ path: path.join(dir, `${name}-view.jpg`), quality: 70 });
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'sbr-capture';
    style.textContent = '.shell-bar { position: static !important; }';
    document.head.append(style);
  });
  await page.screenshot({ path: path.join(dir, `${name}-full.jpg`), quality: 70, fullPage: true });
  await page.evaluate(() => {
    document.getElementById('sbr-capture')?.remove();
  });
}

// The same screen at desktop and at phone size: <name>-desktop-… and <name>-phone-….
export async function captureBoth(page: Page, dir: string, name: string): Promise<void> {
  const before = page.viewportSize() ?? DESKTOP;
  await page.setViewportSize(DESKTOP);
  await capture(page, dir, `${name}-desktop`);
  await page.setViewportSize(PHONE);
  await capture(page, dir, `${name}-phone`);
  await page.setViewportSize(before);
}
