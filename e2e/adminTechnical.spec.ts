/**
 * @file   e2e/adminTechnical.spec.ts
 * @module e2e
 * @brief  The Technical section: the owner lowers the sign-in tries; it applies without a restart.
 *
 * Responsibility: the owner (development account `dev-owner`, super_admin; its sign-in counts
 *                 the second step as just passed) opens Technical, reads the warning, sets "Sign-
 *                 in tries per address" to 6 with a comment and saves; at once the server
 *                 refuses a sign-in try from this address within the next seven (429), and the
 *                 History lists "Sign-in tries per address: 20 → 6". An Admin (`dev-admin`) has
 *                 no Technical link. The page fits 1280×720 and a 390×844 phone at 100, 125 and
 *                 150 % (./acceptance/fitProbe). It changes a limit of the whole server, so it
 *                 runs alone after the other specs of its browser (TIMING); the value is put
 *                 back at the end, also on failure. Chromium saves admin-7-technical-*.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./acceptance/fitProbe
 * Spec:           docs/concepts/admin-area.md §4 (Technical), §8 (c), (f), §9 piece 7
 */
import { expect, test, type Page } from '@playwright/test';

import { probe } from './acceptance/fitProbe.js';
import { closeContexts, post, signIn } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// Both sizes at 100, 125 and 150 %, from the top: nothing small, cut, covered or too wide.
async function expectFits(page: Page): Promise<void> {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    for (const font of [16, 20, 24]) {
      await page.setViewportSize(size);
      await page.evaluate((px) => {
        document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
        window.scrollTo(0, 0);
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

test('the owner lowers the sign-in tries and the server applies it at once', async ({
  browser,
}, info) => {
  const shots = info.project.name.startsWith('chromium');
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  await admin.goto('/#/admin');
  await expect(admin.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'Technical' })).toHaveCount(0);
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, 'owner');
  try {
    await owner.goto('/#/admin/technical');
    await expect(owner.getByRole('note')).toContainText('A wrong value can lock players out');
    await owner.getByLabel('Sign-in tries per address').fill('6');
    await owner.getByTestId('technical-comment').fill('Fewer tries');
    await owner.getByTestId('technical-save').click();
    await expect(owner.getByRole('status')).toHaveText('Saved. It applies at once.');
    await expectFits(owner);
    if (shots) await captureLook(owner, SHOTS_DIR, 'admin-7-technical');
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const r = await owner.request.post('/api/v1/auth/login', {
        data: { email: `nobody-${String(i)}@example.com`, password: 'not the password' },
      });
      codes.push(r.status());
    }
    expect(codes).toContain(429);
    await owner.getByRole('link', { name: 'History', exact: true }).click();
    await expect(owner.getByTestId('admin-history')).toContainText(
      'Sign-in tries per address: 20 → 6',
    );
  } finally {
    await post(owner, '/api/v1/admin/technical', { values: { loginIp: 20 } });
  }
});
