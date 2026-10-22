/**
 * @file   e2e/account.spec.ts
 * @module e2e
 * @brief  Register, sign in, join a match, sign out; wrong password; too many tries (WP-09).
 *
 * Responsibility: a new account registers from the top bar, signs out, signs in again,
 *                 joins an open match from the lobby and signs out; a wrong password and an
 *                 unknown e-mail get the same plain answer; repeated failures for one
 *                 account get the rate-limit message (Chromium only, so the full suite stays
 *                 under the per-address login limit). The test deletes its account
 *                 (DELETE /me) and stops its match, also when a step fails. In Chromium it
 *                 saves the register and sign-in forms (both sizes and themes) to
 *                 reports/screens/night-4/.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §2.1, §13
 */
import { expect, test, type Page } from '@playwright/test';

import { closeContexts, hostMatch, signIn, stopMatch } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

const PASSWORD = 'correct horse battery staple';

// Teardown: deletes the test account; nothing to do when it was never created.
async function deleteAccount(page: Page, email: string): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login', {
    data: { email, password: PASSWORD },
  });
  if (login.status() !== 200) return;
  const session = (await (await page.request.get('/api/v1/session')).json()) as {
    csrfToken: string | null;
  };
  const r = await page.request.delete('/api/v1/me', {
    headers: { 'x-csrf-token': session.csrfToken ?? '' },
    data: { password: PASSWORD },
  });
  expect(r.status(), 'test account deleted').toBe(204);
}

async function signInWithForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId('open-sign-in').click();
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-submit').click();
}

// Contexts this spec opens are closed after every test (see closeContexts).
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('register, sign out, sign in, join a match, sign out', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const shots = info.project.name === 'chromium';
  const name = `e2e${Date.now().toString(36)}`;
  const email = `${name}@example.com`;
  const page = await (await browser.newContext()).newPage();
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Account check',
    gameType: 'classic',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 6,
  });
  try {
    await page.goto('/#/');
    await page.getByTestId('open-register').click();
    await page.getByTestId('register-displayName').fill(name);
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill(PASSWORD);
    if (shots) await captureLook(page, SHOTS_DIR, 'register');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('signed-in-as')).toContainText(`${name} (player)`);
    await page.getByTestId('sign-out').click();
    await expect(page.getByTestId('open-sign-in')).toBeVisible();
    if (shots) {
      await page.getByTestId('open-sign-in').click();
      await captureLook(page, SHOTS_DIR, 'sign-in');
    }
    await signInWithForm(page, email, PASSWORD);
    await expect(page.getByTestId('signed-in-as')).toContainText(`${name} (player)`);
    await page.getByTestId(`join-${code}`).click();
    await expect(page.getByTestId('waiting-room')).toBeVisible();
    await page.getByTestId('sign-out').click();
    await expect(page.getByTestId('open-sign-in')).toBeVisible();
  } finally {
    await stopMatch(host, code);
    await deleteAccount(page, email);
  }
});

test('a wrong password and an unknown e-mail get the same plain answer', async ({ page }) => {
  await page.goto('/#/');
  await signInWithForm(page, `nobody${Date.now().toString(36)}@example.com`, 'not the password');
  await expect(page.getByTestId('sign-in-error')).toHaveText('Wrong e-mail or password.');
});

test('too many tries for one account get the rate-limit message', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'Chromium only: the login limit is per address');
  const email = `limit${Date.now().toString(36)}@example.com`;
  await page.goto('/#/');
  await page.getByTestId('open-sign-in').click();
  for (let i = 0; i < 6; i += 1) {
    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-password').fill('not the password');
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByTestId('sign-in-error')).toBeVisible();
  }
  await expect(page.getByTestId('sign-in-error')).toHaveText(
    'Too many tries. Please wait a minute and try again.',
  );
});
