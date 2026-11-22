/**
 * @file   e2e/adminLeague.spec.ts
 * @module e2e
 * @brief  The League: change the 1st-place points, correct a player's points, see it on the profile.
 *
 * Responsibility: the admin (development account `dev-admin`) opens League, changes "1st place"
 *                 with a comment and saves; the History shows "1st place: … → …". A player the
 *                 spec registers gets a correction of +15 with its reason; the League page lists
 *                 it and the player's profile shows it. The League page fits 1280×720 and a
 *                 390×844 phone at 100, 125 and 150 % (./acceptance/fitProbe). It changes the
 *                 league table of the whole server, so it runs alone after the other specs of
 *                 its browser (TIMING); the value is put back and the account deleted (with its
 *                 correction) at the end, also on failure. Chromium saves admin-5-league-* and
 *                 admin-5-profile-*.
 * Depends on:     @playwright/test, ./devStack, ./realGame, ./screens, ./acceptance/fitProbe
 * Spec:           docs/concepts/admin-area.md §4 (League), §6, §9 piece 5
 */
import { expect, request, test, type Page } from '@playwright/test';

import { probe } from './acceptance/fitProbe.js';
import { CLIENT_URL } from './devStack.js';
import { closeContexts, post, signIn } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const PASSWORD = 'correct horse battery staple';

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

test('an admin changes the league points and corrects a player', async ({ browser }, info) => {
  const shots = info.project.name.startsWith('chromium');
  const stamp = String(Date.now() % 1_000_000);
  const name = `league${stamp}`;
  const player = await request.newContext({ baseURL: CLIENT_URL });
  const registered = await player.post('/api/v1/auth/register', {
    data: { email: `${name}@example.com`, displayName: name, password: PASSWORD },
  });
  expect(registered.status()).toBe(201);
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  const before = (
    (await (await admin.request.get('/api/v1/admin/league')).json()) as {
      fields: { path: string; value: number }[];
    }
  ).fields.find((f) => f.path === 'place1')?.value;
  const next = before === 150 ? 160 : 150;
  try {
    await admin.goto('/#/admin/league');
    await admin.getByLabel('1st place').fill(String(next));
    await admin.getByTestId('league-comment').fill('Bigger wins');
    await admin.getByTestId('league-save').click();
    await expect(admin.getByRole('status')).toHaveText(
      'Saved. It applies to matches that finish from now on.',
    );
    await admin.getByTestId('correction-player').fill(name);
    await admin.getByTestId('correction-delta').fill('15');
    await admin.getByTestId('correction-reason').fill('Points of the broken match');
    await admin.getByTestId('correction-add').click();
    const listed = admin.locator('[data-testid^="correction-"]').filter({ hasText: name });
    await expect(listed).toContainText('+15 points — Points of the broken match');
    await expectFits(admin);
    if (shots) await captureLook(admin, SHOTS_DIR, 'admin-5-league', listed);
    await admin.getByRole('link', { name: 'History', exact: true }).click();
    await expect(admin.getByTestId('admin-history')).toContainText(
      `1st place: ${String(before)} → ${String(next)}`,
    );
    await admin.goto(`/#/players/${name}`);
    await expect(admin.getByTestId('profile-corrections')).toContainText(
      '+15 points — Points of the broken match',
    );
    if (shots) await captureLook(admin, SHOTS_DIR, 'admin-5-profile');
  } finally {
    await post(admin, '/api/v1/admin/league', { values: { place1: before } });
    await player.post('/api/v1/auth/login', {
      data: { email: `${name}@example.com`, password: PASSWORD },
    });
    const session = (await (await player.get('/api/v1/session')).json()) as { csrfToken: string };
    const gone = await player.delete('/api/v1/me', {
      headers: { 'x-csrf-token': session.csrfToken },
      data: { password: PASSWORD },
    });
    expect(gone.status(), 'test account deleted').toBe(204);
    await player.dispose();
  }
});
