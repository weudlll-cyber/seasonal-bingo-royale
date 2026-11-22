/**
 * @file   e2e/backToWebsite.spec.ts
 * @module e2e
 * @brief  "← Seasonal Entertainment" back to the website in website mode, on every main screen.
 *
 * Responsibility: behind the stand-in website (./websiteStack), a member plays a realtime
 *                 royale (with SBR_E2E_FULL_ROYALE=1 at its full length, else and in CI with the
 *                 fast test rules; with bots, as the stack runs with the development
 *                 features) with the link at the top left of the match screen all along; then
 *                 the lobby, the match, "Host a match", the host console, the leaderboard, a
 *                 player profile, the account page and a guest's view each show the link at the
 *                 top left (to /games, same tab), photographed at desktop and phone width in
 *                 both themes as reports/screens/latest/back-<screen>-<size>-<theme>.jpg for
 *                 the owner; the standalone development server's lobby has no such link
 *                 (back-standalone-lobby.jpg). Matches are finished or aborted; the website
 *                 users' accounts are removed. Chromium only (it builds the client).
 * Depends on:     @playwright/test, ./websiteStack, ./screens, ./devStack
 * Spec:           docs/spec/07-integration-architecture.md §6b; the website's GAME-INTEGRATION.md §8
 */
import path from 'node:path';

import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { CLIENT_URL } from './devStack.js';
import { captureLook, DESKTOP, PHONE, SHOTS_DIR } from './screens.js';
import { startWebsiteStack, type WebsiteStack } from './websiteStack.js';

const BASE = '/games/bingo';
const BACK = '← Seasonal Entertainment';
let stack: WebsiteStack;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; it builds the client');
  test.setTimeout(4 * 60_000);
  stack = await startWebsiteStack();
  stack.users.set('w-51', {
    id: 'w-51',
    name: 'Back Host',
    roles: 'member',
    verified: true,
    canHost: true,
  });
  stack.users.set('w-52', {
    id: 'w-52',
    name: 'Back Player',
    roles: 'member',
    verified: true,
    canHost: false,
  });
});

test.afterAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  await stack.removeAccounts();
  await stack.close();
});

// A website member signed in to the game in this page (through the stand-in's proxy).
async function signIn(page: Page, id: string, hash: string): Promise<void> {
  await page.context().addCookies([{ name: 'stub_user', value: id, url: stack.origin }]);
  await page.goto(
    `${stack.origin}${BASE}/auth/website?next=${encodeURIComponent(`${BASE}/${hash}`)}`,
  );
  // Attached, not visible: the account folds into the menu when the bar's items do not fit.
  await expect(page.getByTestId('signed-in-as')).toBeAttached();
}

// The same member as an API client, for the host's steps.
async function apiOf(id: string): Promise<APIRequestContext> {
  const cookie = { name: 'stub_user', value: id, domain: '127.0.0.1', path: '/', expires: -1 };
  const ctx = await request.newContext({
    baseURL: stack.origin,
    storageState: {
      cookies: [{ ...cookie, httpOnly: false, secure: false, sameSite: 'Lax' as const }],
      origins: [],
    },
  });
  expect((await ctx.get(`${BASE}/auth/website`)).ok()).toBe(true);
  return ctx;
}

async function post(ctx: APIRequestContext, url: string, data: unknown) {
  const { csrfToken } = (await (await ctx.get(`${BASE}/api/v1/session`)).json()) as {
    csrfToken: string;
  };
  return ctx.post(`${BASE}/api/v1${url}`, { data, headers: { 'x-csrf-token': csrfToken } });
}

async function newMatch(
  host: APIRequestContext,
  title: string,
  extra: object = {},
): Promise<string> {
  const created = await post(host, '/matches', {
    title,
    gameType: 'royale',
    drawMode: 'auto',
    missedNumbers: { kind: 'autoMarkAfter', delayMs: 1000 },
    maxPlayers: 20,
    // A spec is a development tool: no preset needed (2026-11-21).
    devTools: true,
    ...extra,
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { code: string }).code;
}

// The link is there, leads to /games in this tab, and sits at the top left of the window.
// At desktop and phone width (the window put back afterwards).
async function expectBackLink(page: Page): Promise<void> {
  const back = page.getByRole('link', { name: BACK });
  const before = page.viewportSize() ?? DESKTOP;
  for (const size of [DESKTOP, PHONE]) {
    await page.setViewportSize(size);
    await expect(back).toBeVisible();
    expect(await back.getAttribute('href')).toBe('/games');
    expect(await back.getAttribute('target')).toBeNull();
    const box = await back.boundingBox();
    const where = `${String(size.width)} px: ${JSON.stringify(box)}`;
    expect(box !== null && box.x < 48 && box.y < 64 && box.x + box.width < size.width, where).toBe(
      true,
    );
  }
  await page.setViewportSize(before);
}

// SBR_E2E_FULL_ROYALE=1: the royale at its full length (the one full-length play-through of a
// task that changes the screens, CLAUDE.md); otherwise, as in CI, the fast test rules.
const FULL = process.env['SBR_E2E_FULL_ROYALE'] === '1';

test('a realtime royale played through, with the way back on the match screen all along', async ({
  page,
}) => {
  test.setTimeout((FULL ? 75 : 15) * 60_000);
  const host = await apiOf('w-51');
  const code = await newMatch(host, 'Royale', FULL ? {} : { testProfile: 'fast' });
  await signIn(page, 'w-52', `#/match/${code}`);
  await page.goto(`${stack.origin}${BASE}/`);
  await page.getByTestId(`join-${code}`).click();
  await expect(page.getByTestId('waiting-room')).toBeVisible();
  expect((await post(host, `/matches/${code}/bots`, { upTo: 12 })).ok()).toBe(true);
  expect((await post(host, `/matches/${code}/start`, {})).ok()).toBe(true);
  await expect(page.getByTestId('arena')).toBeVisible({ timeout: 60_000 });
  await expectBackLink(page);
  await expect
    .poll(
      async () =>
        ((await (await host.get(`${BASE}/api/v1/matches/${code}`)).json()) as { status: string })
          .status,
      {
        timeout: (FULL ? 70 : 12) * 60_000,
        intervals: [30_000],
      },
    )
    .toBe('finished');
  await expectBackLink(page);
  await host.dispose();
});

test('every main screen shows the way back at the top left (screenshots for the owner)', async ({
  page,
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const host = await apiOf('w-51');
  const code = await newMatch(host, 'Screens', { testProfile: 'fast' });
  await signIn(page, 'w-51', '#/');
  const shots: [string, string, string][] = [
    ['lobby', '#/', 'lobby-match-' + code],
    ['host-new', '#/host/new', 'start-title'],
    ['host', `#/host/${code}`, 'host-console'],
    ['leaderboard', '#/leaderboard', 'leaderboard-page'],
    ['profile', '#/players/Back_Host', 'profile-page'],
    ['account', '#/account', 'account-page'],
  ];
  try {
    for (const [name, hash, testId] of shots) {
      await page.goto(`${stack.origin}${BASE}/${hash}`);
      await expect(page.getByTestId(testId)).toBeVisible();
      await expectBackLink(page);
      await captureLook(page, SHOTS_DIR, `back-${name}`);
    }
    // The match as its player, while it runs.
    const player = await (await browser.newContext()).newPage();
    await signIn(player, 'w-52', '#/');
    await player.getByTestId(`join-${code}`).click();
    expect((await post(host, `/matches/${code}/bots`, { upTo: 8 })).ok()).toBe(true);
    expect((await post(host, `/matches/${code}/start`, {})).ok()).toBe(true);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
    await expectBackLink(player);
    await captureLook(player, SHOTS_DIR, 'back-match');
    // A guest of the website watching the same match.
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(`${stack.origin}${BASE}/#/match/${code}`);
    await expect(guest.getByTestId('arena')).toBeVisible();
    await expect(guest.getByTestId('open-sign-in')).toBeVisible();
    await expectBackLink(guest);
    await captureLook(guest, SHOTS_DIR, 'back-guest');
  } finally {
    await post(host, `/matches/${code}/abort`, { reason: 'test cleanup' });
    await host.dispose();
  }
});

test('a standalone install shows no way back', async ({ page }) => {
  await page.goto(`${CLIENT_URL}/#/`);
  await expect(page.getByTestId('open-sign-in')).toBeVisible();
  await expect(page.getByRole('link', { name: BACK })).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'back-standalone-lobby.jpg'), quality: 75 });
});
