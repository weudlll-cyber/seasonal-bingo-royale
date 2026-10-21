/**
 * @file   e2e/hostNav.spec.ts
 * @module e2e
 * @brief  The host finds the console again; a player window shows no Manage; the top bar (POLISH-1).
 *
 * Responsibility: the host creates a match, goes to the lobby, returns via "Manage", fills
 *                 it with bots and starts it; opens the match screen and returns via "Open
 *                 host console"; the same window signed in as a player shows no "Manage"
 *                 and no host link. The top bar never covers a field brought to the top edge
 *                 on a wide screen and scrolls away on a phone. In Chromium it also saves the create
 *                 form, the lobby and the waiting room at desktop and phone size to
 *                 reports/screens/real-game/.
 * Depends on:     @playwright/test, node:path, ./devStack, ./realGame, ./screens
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §13
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';
import { fillAndStart, hostMatch, joinFromLobby, signIn } from './realGame.js';
import { captureBoth, DESKTOP, PHONE } from './screens.js';

const SHOTS = path.join(REPO_ROOT, 'reports', 'screens', 'real-game');

// Stops the match through the host's abort route, in any status (the console offers Abort
// only while a match runs).
async function abort(page: Page, code: string): Promise<void> {
  const session = (await (await page.request.get('/api/v1/session')).json()) as {
    csrfToken: string;
  };
  const r = await page.request.post(`/api/v1/matches/${code}/abort`, {
    headers: { 'x-csrf-token': session.csrfToken },
    data: { reason: 'navigation check done' },
  });
  expect(r.status()).toBeLessThan(300);
}

test('the host returns via Manage and Open host console; a player sees no Manage', async ({
  browser,
}, info) => {
  // Mobile WebKit waits seconds for every click to settle; the journey has about 25 steps.
  test.setTimeout(240_000);
  const shots = info.project.name === 'chromium';
  const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(page, 'host');
  if (shots) {
    await page.goto('/#/host/new');
    await page.getByTestId('create-title').fill('Friday night bingo');
    await captureBoth(page, SHOTS, 'create-form');
  }
  const code = await hostMatch(page, {
    title: 'Friday night bingo',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 6,
  });
  try {
    // A player waits in the waiting room.
    const player = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await signIn(player, 'player-2');
    await joinFromLobby(player, code);
    if (shots) await captureBoth(player, SHOTS, 'waiting-room');

    // To the lobby, and back to the console via Manage.
    await page.getByRole('link', { name: 'Play', exact: true }).click();
    await expect(page.getByTestId(`manage-${code}`)).toBeVisible();
    if (shots) await captureBoth(page, SHOTS, 'lobby');
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
    await abort(page, code);
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
