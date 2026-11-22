/**
 * @file   e2e/adminHistory.spec.ts
 * @module e2e
 * @brief  The Overview's switches, the History and "Undo this change" (admin area, piece 2).
 *
 * Responsibility: the admin (development account `dev-admin`) switches guests off with a
 *                 comment on the Overview; at once the server refuses a guest session; the
 *                 History shows the change with the admin's name, old → new and the comment;
 *                 "Undo this change" brings guests back and the History lists the undo. The
 *                 History fits 1280×720 and a 390×844 phone at 100, 125 and 150 % (no text
 *                 below 14 px, nothing cut, covered or wider than the window, ./acceptance/
 *                 fitProbe). It changes a switch of the whole server, so it runs alone after the
 *                 other specs of its browser (TIMING); the switches are put back at the end,
 *                 also on failure. Chromium saves admin-2-switches-* and admin-2-history-*.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./acceptance/fitProbe
 * Spec:           docs/concepts/admin-area.md §4, §6, §8 (k), (p), §9 piece 2
 */
import { expect, test, type Page } from '@playwright/test';

import { probe } from './acceptance/fitProbe.js';
import { closeContexts, post, signIn } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const guestSession = (page: Page) => page.request.post('/api/v1/auth/guest', { data: {} });

// Both sizes at 100, 125 and 150 %: nothing small, cut, covered or wider than the window.
async function expectFits(page: Page): Promise<void> {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    for (const font of [16, 20, 24]) {
      await page.setViewportSize(size);
      await page.evaluate((px) => {
        document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
      }, font);
      const p = await probe(page);
      const what = `${String(size.width)} px at ${String(font)} px`;
      expect([p.smallText, p.cut, p.overlaps, p.hScroll], what).toEqual([[], [], [], false]);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
}

test('an admin switches guests off, sees it in the History and undoes it', async ({
  browser,
}, info) => {
  const shots = info.project.name.startsWith('chromium');
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  try {
    await admin.goto('/#/admin');
    await admin.getByTestId('admin-switch-guests').uncheck();
    await admin.getByTestId('admin-switches-comment').fill('No guests tonight');
    await admin.getByTestId('admin-switches-save').click();
    await expect(admin.getByRole('status')).toHaveText('Saved. It applies at once.');
    if (shots) await captureLook(admin, SHOTS_DIR, 'admin-2-switches');
    expect((await guestSession(admin)).status()).toBe(404);
    await admin.getByRole('link', { name: 'History', exact: true }).click();
    const change = admin.locator('[data-testid^="admin-history-"]').first();
    await expect(change).toContainText('Guests may watch: on → off');
    await expect(change).toContainText('dev-admin');
    await expect(change).toContainText('No guests tonight');
    await expectFits(admin);
    if (shots) await captureLook(admin, SHOTS_DIR, 'admin-2-history');
    await change.getByRole('button', { name: 'Undo this change' }).click();
    await expect(admin.locator('[data-testid^="admin-history-"]').first()).toContainText(
      'Undo of version',
    );
    expect((await guestSession(admin)).status()).toBe(201);
  } finally {
    await post(admin, '/api/v1/admin/switches', { guests: true, emailVerification: false });
  }
});
