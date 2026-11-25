/**
 * @file   e2e/chatEmbed.spec.ts
 * @module e2e
 * @brief  The website's chat docked under the game in website mode (07 §6, K18), and none standalone.
 *
 * Responsibility: behind the stand-in website (./websiteStack, serving /embed/chat), a member who
 *                 may host has the chat in a strip under the game on lobby, host console and
 *                 match screen from the first paint, no button to press: at 1440×900 the strip
 *                 spans the page below the game, holds the frame of /embed/chat?room=bingo&theme=
 *                 <game theme> on the site's origin (the kit's WebsiteChatFrame), follows theme
 *                 switches and is there after a reload; at 390×844 the kit's bar sits at the bottom,
 *                 opens the chat as a sheet and closes it again. Standalone: no chat, no request for
 *                 the embed page. Match aborted, account removed. Chromium only.
 * Depends on:     @playwright/test, ./websiteStack, ./screens, ./devStack
 * Spec:           docs/spec/07-integration-architecture.md §6
 */
import { expect, test, type Page } from '@playwright/test';

import { CLIENT_URL } from './devStack.js';
import { captureThemes, PHONE, setTheme, SHOTS_DIR } from './screens.js';
import { startWebsiteStack, type WebsiteStack } from './websiteStack.js';

const BASE = '/games/bingo';
const WIDE = { width: 1440, height: 900 };
let stack: WebsiteStack;

test.beforeAll(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; it builds the client');
  test.setTimeout(4 * 60_000);
  stack = await startWebsiteStack();
  stack.users.set('9031', {
    id: '9031',
    name: 'Chat Member',
    roles: 'member',
    verified: true,
    canHost: true,
  });
});

test.afterAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  await stack.removeAccounts();
  await stack.close();
});

// The member signs in through the website's proxy and lands on the lobby.
async function signInMember(page: Page): Promise<void> {
  await page.context().addCookies([{ name: 'stub_user', value: '9031', url: stack.origin }]);
  await page.goto(`${stack.origin}${BASE}/auth/website?next=${BASE}/%23/`);
  await expect(page.getByTestId('signed-in-as')).toContainText('Chat_Member');
}

// The page's POST with its CSRF token.
async function post(page: Page, url: string, data: unknown) {
  const session = (await (
    await page.request.get(`${stack.origin}${BASE}/api/v1/session`)
  ).json()) as {
    csrfToken: string;
  };
  return page.request.post(`${stack.origin}${BASE}/api/v1${url}`, {
    data,
    headers: { 'x-csrf-token': session.csrfToken },
  });
}

const frame = (page: Page) => page.frameLocator('[data-testid="chat-frame"]');

// The kit's frame (WebsiteChatFrame): the site's own embed page, sandboxed (K17), with the
// strict-origin referrer.
async function expectRoom(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const element = page.getByTestId('chat-frame');
  expect(await element.getAttribute('src')).toBe(`/embed/chat?room=bingo&theme=${theme}`);
  expect(await element.getAttribute('sandbox')).toBe(
    'allow-scripts allow-same-origin allow-forms allow-popups',
  );
  expect(await element.getAttribute('referrerpolicy')).toBe('strict-origin');
  const loaded = page.frames().map((f) => f.url());
  expect(loaded).toContain(`${stack.origin}/embed/chat?room=bingo&theme=${theme}`);
  await expect(frame(page).getByTestId('embed-room')).toHaveText('Website chat · room bingo');
  await expect(frame(page).getByTestId('embed-theme')).toHaveText(theme);
}

test('the chat strip under the lobby, console and match on a wide screen', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInMember(page);
  // From the first paint, no button: the strip under the game, the page as wide as the dock.
  await expect(page.getByTestId('chat-frame')).toBeVisible();
  await expect(page.getByTestId('chat-toggle')).toHaveCount(0);
  const strip = await page.getByTestId('chat-dock').boundingBox();
  const game = await page.locator('.sk-docked-main').boundingBox();
  expect(strip !== null && game !== null && strip.y >= game.y + game.height - 1).toBe(true);
  expect(strip?.height).toBeGreaterThanOrEqual(150);
  await setTheme(page, 'light');
  await expectRoom(page, 'light');
  await setTheme(page, 'dark');
  await expectRoom(page, 'dark');
  await captureThemes(page, SHOTS_DIR, 'chat-1440');
  // There again after a reload.
  await page.reload();
  await expect(page.getByTestId('chat-frame')).toBeVisible();
  const created = await post(page, '/matches', {
    title: 'Chat match',
    gameType: 'royale',
    // An organizer names a published preset (2026-11-21).
    preset: 'royale-realtime',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 10,
  });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  try {
    await page.goto(`${stack.origin}${BASE}/#/host/${code}`);
    await expect(page.getByTestId('host-console')).toBeVisible();
    await expect(page.getByTestId('chat-frame')).toBeVisible();
    await page.goto(`${stack.origin}${BASE}/#/match/${code}`);
    await expect(page.getByTestId('chat-frame')).toBeVisible();
  } finally {
    await post(page, `/matches/${code}/abort`, { reason: 'test cleanup' });
  }
});

test('a bar and a sheet on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInMember(page);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    // The kit's bar at the bottom of the screen, the chat closed behind it.
    const bar = page.getByTestId('chat-bar');
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box !== null && box.y + box.height <= PHONE.height).toBe(true);
    await bar.click();
    const sheet = page.getByRole('dialog', { name: 'Chat' });
    await expect(sheet).toBeVisible();
    await expectRoom(page, theme);
    await page.screenshot({ path: `${SHOTS_DIR}/chat-390-${theme}.jpg`, quality: 75 });
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    await expect(bar).toBeVisible();
  }
});

test('a standalone install shows no chat and asks for no embed page', async ({ page }) => {
  const embeds: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/embed/')) embeds.push(r.url());
  });
  await page.goto(`${CLIENT_URL}/#/`);
  await expect(page.getByTestId('sign-in')).toBeVisible();
  await expect(page.getByTestId('chat-toggle')).toHaveCount(0);
  expect(embeds).toEqual([]);
});
