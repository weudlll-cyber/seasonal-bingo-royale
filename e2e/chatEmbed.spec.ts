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
 *                 opens the chat as a sheet and closes it again. At 1280×720 with a 32 px root font
 *                 the player's round and the host console stack (the side column below the play
 *                 area, no heading or line wider than its box); at 16 px it stands beside. At
 *                 1900×860 it stays beside at 32 px with no panel's text running into the next;
 *                 on phones at 32 px the player's card is no wider than its box.
 *                 Standalone: no chat, no request for the embed page. Matches aborted, account
 *                 removed. Chromium only.
 * Depends on:     @playwright/test, ./websiteStack, ./screens, ./devStack
 * Spec:           docs/spec/07-integration-architecture.md §6; docs/spec/01-game-design.md §13
 */
import { expect, test, type Page } from '@playwright/test';
import { PHONE, setTheme } from '@seasonal/kit/testing';

import { CLIENT_URL } from './devStack.js';
import { captureThemes, SHOTS_DIR } from './screens.js';
import { startWebsiteStack, type WebsiteStack } from './websiteStack.js';
import { FROM_THIS_SITE } from './fromThisSite.js';

const BASE = '/games/bingo';
const WIDE = { width: 1440, height: 900 };
let stack: WebsiteStack;

test.beforeAll(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough; it builds the client');
  test.setTimeout(4 * 60_000);
  stack = await startWebsiteStack();
  stack.addMember({ id: 9031, name: 'Chat Member', role: 'member', canHost: true });
});

test.afterAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  await stack.removeAccounts();
  await stack.close();
});

// The member signs in through the website's proxy and lands on the lobby.
async function signInMember(page: Page): Promise<void> {
  await page.context().addCookies([stack.cookieOf(9031)]);
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
    headers: { ...FROM_THIS_SITE, 'x-csrf-token': session.csrfToken },
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
  // The kit's stand-in frame, which speaks the website's messages.
  await expect(frame(page).getByText('chat (stand-in)')).toBeVisible();
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

// Where a match screen's side column stands (below the play area, or beside it), the headings
// and lines whose words reach past their own box, and the side panels shorter than their text.
const columnsOf = (page: Page, play: string, side: string) =>
  page.evaluate(
    ([a, b]) => {
      const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const [left, right] = [box(a ?? ''), box(b ?? '')];
      const texts = [...document.querySelectorAll<HTMLElement>('.sk-docked-main :is(h1, h2, p)')];
      const panels = [
        ...document.querySelectorAll<HTMLElement>('.arena-side > :not(.standings-panel)'),
      ];
      return {
        short: panels
          .filter((t) => t.scrollHeight > t.clientHeight + 1)
          .map((t) => t.textContent.slice(0, 40)),
        below: left !== undefined && right !== undefined && right.top >= left.bottom - 1,
        beside: left !== undefined && right !== undefined && right.left >= left.right - 1,
        spilling: texts
          .filter((t) => t.clientWidth > 0 && t.scrollWidth > t.clientWidth + 1)
          .map((t) => t.textContent.slice(0, 40)),
      };
    },
    [play, side],
  );

// 16 px: the side column beside the play area; 32 px: below it, no text past its box.
async function expectAdapts(page: Page, play: string, side: string): Promise<void> {
  for (const font of [16, 32]) {
    await atFont(page, font);
    const what = `${play} at ${String(font)} px`;
    await expect
      .poll(() => columnsOf(page, play, side), { message: what })
      .toEqual({ below: font === 32, beside: font === 16, spilling: [], short: [] });
  }
}

const atFont = (page: Page, font: number) =>
  page.evaluate((px) => {
    document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
  }, font);

// How far the player's card reaches past the width of its box (0: it fits).
const cardOverhang = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.arena-cards')?.getBoundingClientRect();
    const card = document.querySelector('.own-cards .live-card')?.getBoundingClientRect();
    if (box === undefined || card === undefined) return -1;
    return Math.max(0, Math.round(card.right - box.right), Math.round(box.left - card.left));
  });

// A wide window keeps the columns at 32 px, with every side panel as tall as its text; on a
// phone the player's card fits the width (the game area scrolls up and down).
async function expectRoomAndCard(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1900, height: 860 });
  await atFont(page, 32);
  await expect
    .poll(() => columnsOf(page, '.arena-play', '.arena-side'), { message: 'wide at 32 px' })
    .toEqual({ below: false, beside: true, spilling: [], short: [] });
  for (const size of [PHONE, { width: 360, height: 780 }]) {
    await page.setViewportSize(size);
    await expect
      .poll(() => cardOverhang(page), { message: `card at ${String(size.width)} px, 32 px font` })
      .toBe(0);
  }
}

test('at a large font the match screens stack under the dock', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signInMember(page);
  const created = await post(page, '/matches', {
    title: 'Large font royale',
    gameType: 'royale',
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    countsForLeaderboard: false,
    maxPlayers: 10,
    startRule: { kind: 'host' },
    roundPause: { kind: 'host' },
    testProfile: 'fast',
    devTools: true,
  });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  try {
    expect((await post(page, `/matches/${code}/join`, {})).status()).toBe(204);
    expect((await post(page, `/matches/${code}/bots`, { upTo: 10 })).status()).toBeLessThan(300);
    await page.goto(`${stack.origin}${BASE}/#/host/${code}`);
    await page.getByTestId('start-match').click();
    // After the 10 s countdown before the first round.
    await expect(page.getByTestId('host-draw-next')).toBeVisible({ timeout: 30_000 });
    await expectAdapts(page, '.host-controls', '.host-side');
    await page.goto(`${stack.origin}${BASE}/#/match/${code}`);
    await expect(page.getByTestId('arena')).toBeVisible();
    await expectAdapts(page, '.arena-play', '.arena-side');
    await expectRoomAndCard(page);
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
