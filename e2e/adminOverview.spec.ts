/**
 * @file   e2e/adminOverview.spec.ts
 * @module e2e
 * @brief  The admin area's Overview: the Admin menu item, every open match, Abort with a reason.
 *
 * Responsibility: the host opens a match; an organizer has no "Admin" item; the admin
 *                 (development account `dev-admin`) opens Admin, finds the match with its host
 *                 and aborts it with a reason, and the host's console says it was cancelled by
 *                 the system with that reason. The Overview fits 1280×720 and a 390×844 phone at
 *                 the root font of 16, 20 and 24 px: no text below 14 px, nothing cut, covered
 *                 or wider than the window (./acceptance/fitProbe). Chromium saves the review
 *                 shots admin-1-overview-<desktop|phone>-<light|dark>. The match ends aborted.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./menu, ./acceptance/fitProbe
 * Spec:           docs/concepts/admin-area.md §4, §9 piece 1; docs/concepts/fit-audit.md §6
 */
import { expect, test, type Page } from '@playwright/test';
import { captureLook } from '@seasonal/kit/testing';

import { probe } from './acceptance/fitProbe.js';
import { openMenu } from './menu.js';
import { closeContexts, hostMatch, signIn, stopMatch } from './realGame.js';
import { SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const SIZES = [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
] as const;

// Every size at 100, 125 and 150 %: nothing small, cut, covered or wider than the window.
async function expectFits(page: Page): Promise<void> {
  for (const size of SIZES) {
    for (const font of [16, 20, 24]) {
      await page.setViewportSize(size);
      await page.evaluate((px) => {
        document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
      }, font);
      const what = `${String(size.width)} px at ${String(font)} px`;
      const p = await probe(page);
      expect(p.smallText, `${what}: text below 14 px`).toEqual([]);
      expect(p.cut, `${what}: text cut`).toEqual([]);
      expect(p.overlaps, `${what}: text covered`).toEqual([]);
      expect(p.hScroll, `${what}: no sideways scroll`).toBe(false);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
}

test('an admin finds every open match and aborts one with a reason', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Admin check',
    gameType: 'classic',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 6,
  });
  try {
    await openMenu(host);
    await expect(host.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, 'admin');
    await openMenu(admin);
    await admin.getByRole('link', { name: 'Admin', exact: true }).click();
    const row = admin.getByTestId(`admin-match-${code}`);
    await expect(row).toContainText('host dev-host');
    await expectFits(admin);
    if (info.project.name === 'chromium') await captureLook(admin, SHOTS_DIR, 'admin-1-overview');
    await row.getByTestId('abort-reason').fill('Wrong prizes chosen');
    await row.getByTestId('abort-match').click();
    await expect(row).toHaveCount(0);
    await host.goto(`/#/host/${code}`);
    await expect(host.getByTestId('cancelled-by')).toHaveText(
      'This match was cancelled by the system.',
    );
    await expect(host.getByTestId('cancelled-reason')).toHaveText('Reason: Wrong prizes chosen');
  } finally {
    await stopMatch(host, code);
  }
});
