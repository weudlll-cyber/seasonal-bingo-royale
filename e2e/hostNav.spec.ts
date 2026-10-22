/**
 * @file   e2e/hostNav.spec.ts
 * @module e2e
 * @brief  The host finds the console again; a player window shows no Manage; the top bar (POLISH-1).
 *
 * Responsibility: the host creates a match, goes to the lobby, returns via "Manage", fills
 *                 it with bots and starts it; opens the match screen and returns via "Open
 *                 host console"; the same window signed in as a player shows no "Manage"
 *                 and no host link. The top bar never covers a field brought to the top edge
 *                 on a wide screen and scrolls away on a phone; at 360 and 390 px the account
 *                 chip is not cut and the buttons stay on one line. The console in the lobby
 *                 shows the open-match notice with the code. In Chromium it also saves the
 *                 create form (start rule "At a set time"), the console in the lobby, the
 *                 lobby and the waiting room at desktop and phone size, light and dark, to
 *                 reports/screens/night-3/.
 * Depends on:     @playwright/test, node:path, ./devStack, ./realGame, ./screens
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §13
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';
import { fillAndStart, hostMatch, joinFromLobby, signIn, stopMatch } from './realGame.js';
import { captureLook, DESKTOP, PHONE } from './screens.js';

const SHOTS = path.join(REPO_ROOT, 'reports', 'screens', 'night-3');

// The create form with the start rules: a start time an hour ahead (local, as the field takes it).
async function shootCreateForm(page: Page): Promise<void> {
  await page.goto('/#/host/new');
  await page.getByTestId('create-title').fill('Friday night bingo');
  await page.getByTestId('create-start-rule').selectOption('at');
  const at = new Date(Date.now() + 3_600_000 - new Date().getTimezoneOffset() * 60_000);
  await page.getByTestId('create-start-at').fill(at.toISOString().slice(0, 16));
  await captureLook(page, SHOTS, 'create-form', page.getByTestId('create-start-at'));
  // The form keeps its choices; the journey's match starts from the console.
  await page.getByTestId('create-start-rule').selectOption('host');
}

test('the host returns via Manage and Open host console; a player sees no Manage', async ({
  browser,
}, info) => {
  // Mobile WebKit waits seconds for every click to settle; the journey has about 25 steps.
  test.setTimeout(240_000);
  const shots = info.project.name === 'chromium';
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(page, 'host');
  if (shots) await shootCreateForm(page);
  const code = await hostMatch(page, {
    title: 'Friday night bingo',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 6,
  });
  // The console in the lobby, with the open-match notice.
  await expect(page.getByTestId('open-match-notice')).toContainText(`(code ${code})`);
  if (shots) await captureLook(page, SHOTS, 'console-lobby');
  try {
    // A player waits in the waiting room.
    const player = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await signIn(player, 'player-2');
    await joinFromLobby(player, code);
    if (shots) await captureLook(player, SHOTS, 'waiting-room');

    // To the lobby, and back to the console via Manage.
    await page.getByRole('link', { name: 'Play', exact: true }).click();
    await expect(page.getByTestId(`manage-${code}`)).toBeVisible();
    if (shots) await captureLook(page, SHOTS, 'lobby');
    await page.getByTestId(`manage-${code}`).click();
    await expect(page.getByTestId('host-console')).toBeVisible();
    await fillAndStart(page, 6);

    // The match screen, and back via Open host console.
    await page.goto(`/#/match/${code}`);
    await expect(page.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('open-host-console').click();
    await expect(page.getByTestId('host-console')).toBeVisible();
    await expect(page.getByTestId('host-draw-next')).toBeVisible();

    // The same window signed in as a player: no Manage, no host link.
    await signIn(page, 'player-1');
    await expect(page.getByTestId(`lobby-match-${code}`)).toBeVisible();
    await expect(page.getByTestId(`manage-${code}`)).toHaveCount(0);
    await page.goto(`/#/match/${code}`);
    await expect(page.getByTestId('arena')).toBeVisible();
    await expect(page.getByTestId('open-host-console')).toHaveCount(0);
  } finally {
    // The match this test created is stopped, also when a step above failed.
    await signIn(page, 'host');
    await stopMatch(page, code);
  }
});

test('the top bar never covers a field jumped to; on a phone it scrolls away', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // A short window, so the create form is longer than the screen.
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 600 } })
  ).newPage();
  await signIn(page, 'host');
  await page.goto('/#/host/new');
  const bar = page.locator('.shell-bar');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  // An in-page jump brings the field to the top edge: it must stop below the bar.
  await page.getByTestId('create-title').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
  });
  const barBox = await bar.boundingBox();
  const fieldBox = await page.getByTestId('create-title').boundingBox();
  expect(barBox).not.toBeNull();
  expect(fieldBox?.y ?? 0, 'field below the sticky bar').toBeGreaterThanOrEqual(
    (barBox?.y ?? 0) + (barBox?.height ?? 0),
  );

  await page.context().close();

  // A fresh phone-sized window (mobile emulation keeps its first layout width on resize),
  // on the Quick Test page: long enough to scroll, and no sign-in needed.
  const phonePage = await (await browser.newContext({ viewport: PHONE })).newPage();
  await phonePage.goto('/#/quicktest');
  await expect(phonePage.getByTestId('start-run')).toBeVisible();
  const phone = await phonePage.evaluate(async () => {
    window.scrollTo(0, 400);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const el = document.querySelector('.shell-bar');
    return {
      scrolled: window.scrollY,
      position: el === null ? '' : getComputedStyle(el).position,
      top: el?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(phone.position, 'not sticky on a phone').not.toBe('sticky');
  expect(phone.scrolled, 'the page scrolled').toBeGreaterThan(0);
  // The bar moved up with the page by exactly the distance scrolled.
  expect(phone.top, 'the bar scrolled away on a phone').toBeCloseTo(-phone.scrolled, 0);
});

test('the account chip and the buttons fit on a phone (360 and 390 px)', async ({ browser }) => {
  for (const width of [360, 390]) {
    const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    // The longest development name, with "Dev sign-in" in the bar.
    await signIn(page, 'player-3');
    const fit = await page.evaluate(() => {
      const chip = document.querySelector<HTMLElement>('[data-testid="signed-in-as"]');
      const buttons = [...document.querySelectorAll<HTMLElement>('.shell-account .sbr-btn')];
      return {
        chipCut: chip === null ? true : chip.scrollWidth > chip.clientWidth,
        tallest: Math.max(...buttons.map((b) => b.getBoundingClientRect().height)),
        wider: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(fit.chipCut, `${String(width)} px: chip not cut`).toBe(false);
    expect(fit.tallest, `${String(width)} px: buttons on one line`).toBeLessThanOrEqual(50);
    expect(fit.wider, `${String(width)} px: nothing wider than the window`).toBe(false);
    await page.context().close();
  }
});
