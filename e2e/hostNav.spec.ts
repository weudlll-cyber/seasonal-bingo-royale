/**
 * @file   e2e/hostNav.spec.ts
 * @module e2e
 * @brief  The host finds the console again; a player window shows no Manage; the top bar (POLISH-1).
 *
 * Responsibility: the host creates a match, goes to the lobby, returns via "Manage", fills it
 *                 with bots and starts it; opens the match screen and returns via "Open host
 *                 console"; as a player the window shows no "Manage" and no host link. The top
 *                 bar never covers a field at the top edge on a wide screen and scrolls away on a
 *                 phone; on a phone (360 and 390 px, and at a 150 % font) the bar is one row and
 *                 one Menu button opens the links and the account, by keyboard too, the chip
 *                 not cut and nothing of the bar or its menu past the window's edge. The lobby
 *                 console shows the open-match notice with the code. Chromium saves the create form ("At a set time"), lobby console, lobby and waiting room
 *                 at desktop and phone size, light and dark, to reports/screens/latest/.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §13
 */
import { expect, test, type Page } from '@playwright/test';

import {
  closeContexts,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
  stopMatch,
} from './realGame.js';
import { openMenu } from './menu.js';
import { captureLook, DESKTOP, PHONE, SHOTS_DIR } from './screens.js';

// "Start a match" with the start rules: a start time an hour ahead (local, as the field takes it).
async function shootCreateForm(page: Page): Promise<void> {
  await page.goto('/#/host/new');
  await page.getByTestId('start-title').fill('Friday night bingo');
  await page.getByTestId('create-start-rule').selectOption('at');
  const at = new Date(Date.now() + 3_600_000 - new Date().getTimezoneOffset() * 60_000);
  await page.getByTestId('create-start-at').fill(at.toISOString().slice(0, 16));
  await captureLook(page, SHOTS_DIR, 'create-form', page.getByTestId('create-start-at'));
  // The form keeps its choices; the journey's match starts from the console.
  await page.getByTestId('create-start-rule').selectOption('host');
}

// "Play" in the bar; the bar folds into the menu whenever its items do not fit on one row.
async function toLobby(page: Page): Promise<void> {
  await openMenu(page);
  await page.getByRole('link', { name: 'Play', exact: true }).click();
}

// Contexts this spec opens are closed after every test (see closeContexts).
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

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
  if (shots) await captureLook(page, SHOTS_DIR, 'console-lobby');
  try {
    // A player waits in the waiting room.
    const player = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await signIn(player, 'player-2');
    await joinFromLobby(player, code);
    if (shots) await captureLook(player, SHOTS_DIR, 'waiting-room');

    // To the lobby, and back to the console via Manage.
    await toLobby(page);
    await expect(page.getByTestId(`manage-${code}`)).toBeVisible();
    if (shots) await captureLook(page, SHOTS_DIR, 'lobby');
    await page.getByTestId(`manage-${code}`).click();
    await expect(page.getByTestId('host-console')).toBeVisible();
    await fillAndStart(page, 6);

    // The match screen; Open host console opens the console in a new tab (a first load: 20 s,
    // like the suite's others) and the player screen stays (D25).
    await page.goto(`/#/match/${code}`);
    await expect(page.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    const [consoleTab] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByTestId('open-host-console').click(),
    ]);
    await expect(consoleTab.getByTestId('host-console')).toBeVisible({ timeout: 20_000 });
    await expect(consoleTab.getByTestId('host-draw-next')).toBeVisible();
    await expect(page.getByTestId('arena')).toBeVisible();
    await consoleTab.close();

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
  await page.getByTestId('start-title').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
  });
  const barBox = await bar.boundingBox();
  const fieldBox = await page.getByTestId('start-title').boundingBox();
  expect(barBox).not.toBeNull();
  expect(fieldBox?.y ?? 0, 'field below the sticky bar').toBeGreaterThanOrEqual(
    (barBox?.y ?? 0) + (barBox?.height ?? 0),
  );

  await page.context().close();

  // A fresh phone-sized window (mobile emulation keeps its first layout width on resize),
  // on the seed check page: long enough to scroll, and no sign-in needed.
  const phonePage = await (await browser.newContext({ viewport: PHONE })).newPage();
  await phonePage.goto('/#/quicktest/seed');
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

// In the page: the bar's height and the tops of the theme toggle and the Menu button.
function barRow(): { height: number; toggle: number; menu: number } {
  const top = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
  return {
    height: document.querySelector('.shell-bar')?.getBoundingClientRect().height ?? 0,
    toggle: top('[data-testid="theme-toggle"]'),
    menu: top('[data-testid="menu-button"]'),
  };
}

// In the page, with the menu open: the chip whole, every link inside the window, nothing of the
// bar or the menu past its right edge.
function openMenuFacts(): { chipCut: boolean; linksIn: boolean; wider: boolean } {
  const chip = document.querySelector<HTMLElement>('[data-testid="signed-in-as"]');
  const links = [...document.querySelectorAll<HTMLElement>('.shell-nav a')];
  return {
    chipCut: chip === null ? true : chip.scrollWidth > chip.clientWidth,
    linksIn: links.every((a) => a.getBoundingClientRect().right <= window.innerWidth),
    // The bar and its open menu, not the page below (the lobby lists whatever other tests
    // created at the time).
    wider: [...document.querySelectorAll('.shell-bar *')].some(
      (el) => el.getBoundingClientRect().right > window.innerWidth + 0.5,
    ),
  };
}

// The phone menu (fit audit O1, O2): the bar is one row, the links and the account open from
// one button, by keyboard too. 360 and 390 px, and 360 px at a 150 % font.
test('on a phone the bar is one row and the menu holds links and account', async ({ browser }) => {
  for (const [width, font] of [
    [360, 16],
    [390, 16],
    [360, 24],
  ] as const) {
    const where = `${String(width)} px at ${String(font)} px`;
    const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
    // The longest development name, with "Dev sign-in" in the menu.
    await signIn(page, 'player-3');
    await page.evaluate((px) => {
      document.documentElement.style.fontSize = `${String(px)}px`;
    }, font);
    const button = page.getByTestId('menu-button');
    await expect(page.getByRole('navigation', { name: 'Main' }), where).toBeHidden();
    const bar = await page.evaluate(barRow);
    expect(Math.abs(bar.toggle - bar.menu), `${where}: toggle and Menu on one row`).toBeLessThan(4);
    expect(bar.height, `${where}: the bar is at most a fifth of the window`).toBeLessThan(160);
    // Keyboard: Enter opens it with the focus on the first link, Escape closes it.
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeFocused();
    const open = await page.evaluate(openMenuFacts);
    expect(open.chipCut, `${where}: chip not cut`).toBe(false);
    expect(open.linksIn, `${where}: every link whole in the window`).toBe(true);
    expect(open.wider, `${where}: nothing wider than the window`).toBe(false);
    await expect(page.getByTestId('sign-out')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await page.context().close();
  }
});
