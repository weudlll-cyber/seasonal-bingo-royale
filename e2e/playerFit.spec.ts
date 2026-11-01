/**
 * @file   e2e/playerFit.spec.ts
 * @module e2e
 * @brief  The player screen fits: ball, drawn numbers and the whole card without scrolling.
 *
 * Responsibility: during a running round of a real match (royale and classic, host draws,
 *                 the host playing along with bots), the current number, the row of drawn
 *                 numbers and the player's whole card lie inside the window at the top of the
 *                 page, header included, at 1280×800 and 1366×768 desktop and on a 390×844
 *                 phone. Chromium saves each size in both themes (player-fit-*). The match is
 *                 aborted afterwards, also on failure.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  post,
  signIn,
  stopMatch,
} from './realGame.js';
import { captureThemes, SHOTS_DIR } from './screens.js';

const VIEWPORTS = [
  { name: '1280x800', size: { width: 1280, height: 800 } },
  { name: '1366x768', size: { width: 1366, height: 768 } },
  { name: 'phone', size: { width: 390, height: 844 } },
] as const;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// The element's box lies wholly inside the window (the page scrolled to the top).
async function expectInside(page: Page, what: string, el: Locator): Promise<void> {
  const box = await el.boundingBox();
  const view = page.viewportSize();
  expect(box, `${what} is on the page`).not.toBeNull();
  if (box === null || view === null) return;
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(0);
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(view.height);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(view.width);
}

for (const gameType of ['royale', 'classic'] as const) {
  test(`player screen fits during a ${gameType} round`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await signIn(page, 'host');
    const code = await hostMatch(page, {
      title: 'Fit check',
      gameType,
      drawMode: 'host',
      missed: 'autoMarkAfter',
      maxPlayers: 10,
    });
    try {
      // The host plays along, as the owner does in a test match.
      expect((await post(page, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
      await fillAndStart(page, 8);
      await drawNext(page);
      await drawNext(page);
      await page.goto(`/#/match/${code}`);
      await expect(page.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
      for (const { name, size } of VIEWPORTS) {
        await page.setViewportSize(size);
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await expectInside(page, `${name} ball`, page.getByTestId('current-ball'));
        await expectInside(page, `${name} drawn numbers`, page.getByTestId('draw-ticker'));
        await expectInside(page, `${name} card`, page.locator('.live-card').first());
        if (info.project.name === 'chromium' && gameType === 'royale') {
          await captureThemes(page, SHOTS_DIR, `player-fit-${name}`);
        }
      }
    } finally {
      await stopMatch(page, code);
    }
  });
}
