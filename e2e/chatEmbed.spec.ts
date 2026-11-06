/**
 * @file   e2e/chatEmbed.spec.ts
 * @module e2e
 * @brief  The website's chat beside the game in website mode (07 §6), and none standalone.
 *
 * Responsibility: behind the stand-in website (./websiteStack, which serves /embed/chat), a
 *                 member who may host sees "Chat" on the lobby, the host console and the match
 *                 screen; at 1440×900 the side panel opens with the frame of
 *                 /embed/chat?room=bingo&theme=<the game's theme>, follows a theme switch, and
 *                 stays open after a reload (remembered); at 390×844 it is a drawer that one tap
 *                 on the dimmed page closes, leaving only the button. Screenshots of the open
 *                 panel in both sizes and themes go to reports/screens/latest. The standalone
 *                 development server shows no button and asks for no embed page. The match is
 *                 aborted, the website user's account removed. Chromium only (it builds the client).
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
  stack.users.set('w-31', {
    id: 'w-31',
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
  await page.context().addCookies([{ name: 'stub_user', value: 'w-31', url: stack.origin }]);
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

async function expectRoom(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const src = (await page.getByTestId('chat-frame').getAttribute('src')) ?? '';
  expect(src).toBe(`${stack.origin}/embed/chat?room=bingo&theme=${theme}`);
  await expect(frame(page).getByTestId('embed-room')).toHaveText('Website chat · room bingo');
  await expect(frame(page).getByTestId('embed-theme')).toHaveText(theme);
}

test('the chat panel beside the lobby, console and match on a wide screen', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInMember(page);
  await expect(page.getByTestId('chat-frame')).toHaveCount(0);
  await page.getByTestId('chat-toggle').click();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  await setTheme(page, 'light');
  await expectRoom(page, 'light');
  await setTheme(page, 'dark');
  await expectRoom(page, 'dark');
  await captureThemes(page, SHOTS_DIR, 'chat-1440');
  // Remembered: open again after a reload.
  await page.reload();
  await expect(page.getByTestId('chat-panel')).toBeVisible();
  const created = await post(page, '/matches', {
    title: 'Chat match',
    gameType: 'royale',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 10,
  });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  try {
    await page.goto(`${stack.origin}${BASE}/#/host/${code}`);
    await expect(page.getByTestId('host-console')).toBeVisible();
    await expect(page.getByTestId('chat-toggle')).toBeVisible();
    await page.goto(`${stack.origin}${BASE}/#/match/${code}`);
    await expect(page.getByTestId('chat-toggle')).toBeVisible();
    await expect(page.getByTestId('chat-panel')).toBeVisible();
  } finally {
    await post(page, `/matches/${code}/abort`, { reason: 'test cleanup' });
  }
});

test('a drawer on a phone that one tap closes', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInMember(page);
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await page.getByTestId('chat-toggle').click();
    await expect(page.getByTestId('chat-panel')).toBeVisible();
    await expectRoom(page, theme);
    await page.screenshot({ path: `${SHOTS_DIR}/chat-390-${theme}.jpg`, quality: 75 });
    // One tap on the dimmed page above the drawer closes it; only the button stays.
    await page.mouse.click(PHONE.width / 2, 40);
    await expect(page.getByTestId('chat-panel')).toBeHidden();
    await expect(page.getByTestId('chat-toggle')).toBeVisible();
  }
});

test('a standalone install shows no chat and asks for no embed page', async ({ page }) => {
  const embeds: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/embed/')) embeds.push(r.url());
  });
  await page.goto(`${CLIENT_URL}/#/`);
  await expect(page.getByTestId('open-sign-in')).toBeVisible();
  await expect(page.getByTestId('chat-toggle')).toHaveCount(0);
  expect(embeds).toEqual([]);
});
