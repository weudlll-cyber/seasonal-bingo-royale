/**
 * @file   e2e/adminAccounts.spec.ts
 * @module e2e
 * @brief  Players and accounts: find an account, make it an Organizer, lock and unlock it.
 *
 * Responsibility: a player account the spec registers is found by the Admin (development
 *                 account `dev-admin`) under the start of its name; "Make Organizer" gives the
 *                 role, "Lock" locks it (its sign-in is refused), "Unlock" lets it in again —
 *                 without `sbr admin`. The page fits 1280×720 and a 390×844 phone at 100, 125 and
 *                 150 % (./acceptance/fitProbe). The account is deleted at the end, also on
 *                 failure. Chromium saves admin-8-accounts-*.
 * Depends on:     @playwright/test, ./devStack, ./realGame, ./screens, ./acceptance/fitProbe
 * Spec:           docs/concepts/admin-area.md §4 (Players and accounts), §9 piece 8
 */
import { expect, request, test, type Page } from '@playwright/test';

import { probe } from './acceptance/fitProbe.js';
import { CLIENT_URL } from './devStack.js';
import { closeContexts, post, signIn } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';
import { FROM_THIS_SITE } from './fromThisSite.js';

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

test('an admin finds an account, makes it an Organizer, locks and unlocks it', async ({
  browser,
}, info) => {
  const shots = info.project.name === 'chromium';
  const name = `acct${String(Date.now() % 1_000_000)}`;
  const email = `${name}@example.com`;
  const player = await request.newContext({
    baseURL: CLIENT_URL,
    extraHTTPHeaders: FROM_THIS_SITE,
  });
  const registered = await player.post('/api/v1/auth/register', {
    data: { email, displayName: name, password: PASSWORD },
  });
  expect(registered.status()).toBe(201);
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  const login = () => player.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  try {
    await admin.goto('/#/admin/accounts');
    await admin.getByTestId('accounts-search').fill(name);
    await admin.getByRole('button', { name: 'Find accounts' }).click();
    const card = admin.getByTestId(`account-${name}`);
    await expect(card).toContainText('Player · Active');
    await card.getByRole('button', { name: 'Make Organizer' }).click();
    await expect(admin.getByRole('status')).toHaveText(`Done: Organizer given (${name}).`);
    await expect(card).toContainText('Organizer');
    await card.getByRole('button', { name: 'Lock' }).click();
    await expect(card).toContainText('Locked');
    expect((await login()).status()).not.toBe(200);
    await expectFits(admin);
    if (shots) await captureLook(admin, SHOTS_DIR, 'admin-8-accounts', card);
    await card.getByRole('button', { name: 'Unlock' }).click();
    await expect(card).toContainText('Active');
  } finally {
    // Unlocked first, so a failure while locked still lets the account delete itself.
    const found = (await (await admin.request.get(`/api/v1/admin/accounts?q=${name}`)).json()) as {
      accounts: { id: string }[];
    };
    const id = found.accounts[0]?.id;
    if (id !== undefined) await post(admin, `/api/v1/admin/accounts/${id}/lock`, { locked: false });
    expect((await login()).status()).toBe(200);
    const session = (await (await player.get('/api/v1/session')).json()) as { csrfToken: string };
    const gone = await player.delete('/api/v1/me', {
      headers: { 'x-csrf-token': session.csrfToken },
      data: { password: PASSWORD },
    });
    expect(gone.status(), 'test account deleted').toBe(204);
    await player.dispose();
  }
});
