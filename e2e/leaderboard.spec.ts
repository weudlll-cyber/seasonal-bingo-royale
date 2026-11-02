/**
 * @file   e2e/leaderboard.spec.ts
 * @module e2e
 * @brief  A real match on the profile and the leaderboard; the account page's export and deletion (WP-15).
 *
 * Responsibility: a classic match (leaderboard switch on, one row wins, timed draws) with two
 *                 dev players and bots played to its end: the final placement links players
 *                 (never bots) to their profiles; the profile lists the match with its place and
 *                 "No league points: bots played", its figures counted without it (D29); the
 *                 board has no row for the player and states the counting rule (03 §11). A
 *                 fresh account downloads its data and deletes itself on the account page.
 *                 Unfinished matches are aborted, accounts left behind deleted. In Chromium the
 *                 leaderboard, profile and deletion step are saved (both sizes and themes).
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/05-api-design.md §2.2, §2.4;
 *                 docs/spec/03-security-architecture.md §11, §19
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  closeContexts,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
  stopMatch,
} from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

const PASSWORD = 'correct horse battery staple';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('a played match shows on the profile and gives no league points with bots', async ({
  browser,
}, info) => {
  test.setTimeout(5 * 60_000);
  const shots = info.project.name === 'chromium';
  const host = await (await browser.newContext()).newPage();
  const one = await (await browser.newContext()).newPage();
  const two = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  await signIn(one, 'player-1');
  await signIn(two, 'player-2');
  // A classic match with the leaderboard switch on: one round, over at the first row, drawn
  // by the server every 4 s, the shortest gap (D12; host presses waited ~5 s each for the
  // D13 lock plus WebKit's round trips and ran past the timeout).
  const code = await hostMatch(host, {
    title: 'League check',
    gameType: 'classic',
    prizes: ['rows-1'],
    drawMode: 'auto',
    intervalSec: 4,
    missed: 'autoMarkAfter',
    maxPlayers: 20,
    leaderboard: true,
  });
  try {
    await joinFromLobby(one, code);
    await joinFromLobby(two, code);
    await host.goto(`/#/host/${code}`);
    await fillAndStart(host, 20);
    await expect(host.getByTestId('end-actions')).toBeVisible({ timeout: 180_000 });
    // The player's final placement: players link to their profiles, bots never.
    const final = one.getByTestId('final-placement');
    await expect(final).toBeVisible({ timeout: 20_000 });
    await expect(final.getByRole('link', { name: 'dev-player-2' })).toHaveAttribute(
      'href',
      '#/players/dev-player-2',
    );
    await expect(final.getByRole('link', { name: /^bot-/ })).toHaveCount(0);
    await final.getByRole('link', { name: 'dev-player-1' }).click();
    const row = one.getByTestId(`profile-match-${code}`);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-league', 'bots');
    await expect(row).toContainText(/#\d+ of 20/);
    await expect(row).toContainText('No league points: bots played');
    // The figures leave matches with bots out (D29); the match is listed all the same.
    await expect(one.getByTestId('profile-figures-rule')).toHaveText(
      'Counted from finished matches without bots.',
    );
    if (shots) await captureLook(one, SHOTS_DIR, 'profile');
    await one.getByTestId('profile-page').getByRole('link', { name: 'To the leaderboard' }).click();
    await expect(one.getByTestId('leaderboard-page')).toBeVisible();
    await expect(one.getByTestId('leaderboard-page')).toContainText('no bots');
    await expect(one.locator('[data-name="dev-player-1"]')).toHaveCount(0);
    if (shots) await captureLook(one, SHOTS_DIR, 'leaderboard');
  } finally {
    await stopMatch(host, code);
  }
});

// Teardown for a failed run: signs in as the account and deletes it.
async function removeAccount(page: Page, email: string): Promise<void> {
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

test('the account page downloads the data and deletes the account', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const name = `acc${Date.now().toString(36)}`;
  const email = `${name}@example.com`;
  const page = await (await browser.newContext()).newPage();
  let deleted = false;
  try {
    await page.goto('/#/register');
    await page.getByTestId('register-displayName').fill(name);
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill(PASSWORD);
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('signed-in-as')).toContainText(`${name} (player)`);
    await page.getByTestId('signed-in-as').click();
    await expect(page.getByTestId('account-page')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByTestId('download-data').click();
    const file = await (await download).path();
    const data = JSON.parse(readFileSync(file, 'utf8')) as { account: { email: string } };
    expect(data.account.email).toBe(email);
    await page.getByTestId('delete-account').click();
    await page.getByTestId('delete-password').fill(PASSWORD);
    if (info.project.name === 'chromium') {
      await captureLook(page, SHOTS_DIR, 'account-delete', page.getByTestId('delete-confirm'));
    }
    await page.getByTestId('delete-confirm').click();
    await expect(page.getByTestId('account-deleted')).toBeVisible();
    deleted = true;
    await expect(page.getByTestId('open-sign-in')).toBeVisible();
    const again = await page.request.post('/api/v1/auth/login', {
      data: { email, password: PASSWORD },
    });
    expect(again.status(), 'the deleted account cannot sign in').toBe(401);
  } finally {
    if (!deleted) await removeAccount(page, email);
  }
});
