/**
 * @file   e2e/websiteIdle.spec.ts
 * @module e2e
 * @brief  A website admin's game session idles out while the website session is still valid.
 *
 * Responsibility: behind the stand-in website (./websiteStack), a website admin (a game admin,
 *                 so an admin session: idle 30 minutes) is on the create page; the game session
 *                 idles out (the 30 minutes shortened: expireSessions) while the website still
 *                 knows the admin. The next action re-signs through the website and lands on the
 *                 same page, signed in, without the website's login form (only the form's input
 *                 is lost, as after a reload); creating the match then works. The match is
 *                 aborted and the website user's account removed. Chromium only (it builds the
 *                 client).
 * Depends on:     @playwright/test, ./websiteStack
 * Spec:           docs/spec/03-security-architecture.md §3; docs/spec/07-integration-architecture.md §2.3
 */
import { expect, test, type Page } from '@playwright/test';

import { startWebsiteStack, type WebsiteStack } from './websiteStack.js';

const BASE = '/games/bingo';
let stack: WebsiteStack;

test.beforeAll(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; it builds the client');
  test.setTimeout(4 * 60_000);
  stack = await startWebsiteStack();
  stack.users.set('w-41', {
    id: 'w-41',
    name: 'Idle Admin',
    roles: 'admin',
    verified: true,
    canHost: true,
  });
});

test.afterAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  await stack.removeAccounts();
  await stack.close();
});

const sessionOf = async (page: Page) =>
  (await (await page.request.get(`${stack.origin}${BASE}/api/v1/session`)).json()) as {
    signedIn: boolean;
    csrfToken: string;
  };

test('the next action after an idle game session re-signs through the website on the same page', async ({
  page,
}) => {
  await page.context().addCookies([{ name: 'stub_user', value: 'w-41', url: stack.origin }]);
  await page.goto(`${stack.origin}${BASE}/auth/website?next=${BASE}/%23/host/new`);
  await expect(page.getByTestId('signed-in-as')).toContainText('Idle_Admin');
  await expect(page.getByTestId('create-title')).toBeVisible();
  stack.expireSessions();
  expect((await sessionOf(page)).signedIn).toBe(false);
  // The next action: create a match. It goes through the website and back to this page.
  await page.getByTestId('create-title').fill('After idle');
  await page.getByTestId('create-submit').click();
  await expect.poll(async () => (await sessionOf(page)).signedIn, { timeout: 20_000 }).toBe(true);
  await expect(page).toHaveURL(`${stack.origin}${BASE}/#/host/new`);
  await expect(page.getByTestId('signed-in-as')).toContainText('Idle_Admin');
  await expect(page.locator('body')).not.toContainText('website login');
  // Signed in again: the action works.
  await page.getByTestId('create-title').fill('After idle');
  await page.getByTestId('create-submit').click();
  await expect(page.getByTestId('host-console')).toBeVisible();
  const code = (await page.getByTestId('host-code').innerText()).trim();
  const { csrfToken } = await sessionOf(page);
  await page.request.post(`${stack.origin}${BASE}/api/v1/matches/${code}/abort`, {
    data: { reason: 'test cleanup' },
    headers: { 'x-csrf-token': csrfToken },
  });
});
