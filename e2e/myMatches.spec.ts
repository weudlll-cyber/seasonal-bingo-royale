/**
 * @file   e2e/myMatches.spec.ts
 * @module e2e
 * @brief  One player in a realtime and an asynchronous royale at once, a tab each (D39).
 *
 * Responsibility: the dev player joins a realtime royale with timed draws and an asynchronous
 *                 royale; the host fills both with bots and starts them. The lobby shows "My
 *                 matches" with both (pace and state); Open takes the first tab to the realtime
 *                 match, a second tab of the same session opens the asynchronous one, which the
 *                 host moves an hour ahead. Each tab shows its own match: "LIVE" and new numbers
 *                 in the realtime tab, "In progress" and the hour's numbers in the other, their
 *                 numbers apart. In Chromium it saves my-matches-lobby-* and
 *                 my-matches-two-tabs-* (desktop and phone, both themes). Both matches are
 *                 aborted afterwards.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §11, §13 (D39)
 */
import { expect, test, type Page } from '@playwright/test';

import { closeContexts, currentItem, post, signIn, stopMatch } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

const ROYALE = { gameType: 'royale', missedNumbers: { kind: 'noAutoMark' }, maxPlayers: 10 };

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// A royale the player joined, filled with bots and started by the host; returns its code.
async function startedRoyale(host: Page, player: Page, body: object): Promise<string> {
  const created = await post(host, '/api/v1/matches', { ...ROYALE, ...body });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  expect((await post(player, `/api/v1/matches/${code}/join`, {})).ok()).toBe(true);
  expect((await post(host, `/api/v1/matches/${code}/bots`, { upTo: 10 })).ok()).toBe(true);
  expect((await post(host, `/api/v1/matches/${code}/start`, {})).ok()).toBe(true);
  return code;
}

// "My matches" in the lobby lists both with their pace, both started. The section polls
// every 3 s since the sign-in: both starts are in once it says so.
async function lobbyShowsBoth(page: Page, live: string, slow: string): Promise<void> {
  await page.goto('/#/');
  await expect(page.getByTestId(`my-match-${live}`)).toContainText('Evening royale · Realtime');
  await expect(page.getByTestId(`my-match-${slow}`)).toContainText('Slow royale · Asynchronous');
  for (const code of [live, slow]) {
    await expect(page.getByTestId(`my-match-state-${code}`)).toHaveText(/^(Starting…|Round 1)$/);
  }
}

// The numbers drawn so far on a player screen.
const drawnOn = (page: Page) => page.getByTestId('draw-ticker').locator(':scope > *').count();

test('one player, two matches, a tab each (D39)', async ({ browser }, info) => {
  test.setTimeout(4 * 60_000);
  const shots = info.project.name === 'chromium';
  const host = await (await browser.newContext()).newPage();
  const session = await browser.newContext();
  const tab1 = await session.newPage();
  await signIn(host, 'host');
  await signIn(tab1, 'player-1');
  const codes: string[] = [];
  try {
    const live = await startedRoyale(host, tab1, {
      title: 'Evening royale',
      drawMode: 'auto',
      drawIntervalMs: 4_000,
    });
    codes.push(live);
    const slow = await startedRoyale(host, tab1, {
      title: 'Slow royale',
      mode: 'async',
      drawMode: 'auto',
      quietHours: null,
    });
    codes.push(slow);
    await lobbyShowsBoth(tab1, live, slow);
    if (shots)
      await captureLook(tab1, SHOTS_DIR, 'my-matches-lobby', tab1.getByTestId('my-matches'));
    // Open: the realtime match in this tab; the asynchronous one in a second tab, an hour on.
    await tab1.getByTestId(`my-open-${live}`).click();
    await expect(tab1).toHaveURL(new RegExp(`#/match/${live}$`));
    expect((await post(host, '/api/v1/dev/time-travel', { code: slow, ms: 3_600_000 })).ok()).toBe(
      true,
    );
    const tab2 = await session.newPage();
    await tab2.goto(`/#/match/${slow}`);
    await expect(tab2.locator('.sbr-badge-live')).toHaveText('In progress');
    const dismiss = tab2.getByTestId('away-dismiss');
    if (await dismiss.isVisible()) await dismiss.click();
    await expect(tab1.locator('.sbr-badge-live')).toHaveText('LIVE', { timeout: 20_000 });
    // The realtime tab keeps drawing; the asynchronous tab holds its hour of numbers.
    await expect.poll(() => currentItem(tab1), { timeout: 20_000 }).not.toBeNull();
    const slowDrawn = await drawnOn(tab2);
    expect(slowDrawn).toBeGreaterThan(0);
    const first = await drawnOn(tab1);
    await expect.poll(() => drawnOn(tab1), { timeout: 20_000 }).toBeGreaterThan(first);
    expect(await drawnOn(tab2)).toBe(slowDrawn);
    await expect(tab1.locator('h1')).toContainText('Evening royale');
    await expect(tab2.locator('h1')).toContainText('Slow royale');
    if (shots) {
      await captureLook(tab1, SHOTS_DIR, 'my-matches-two-tabs-realtime');
      await captureLook(tab2, SHOTS_DIR, 'my-matches-two-tabs-async');
    }
  } finally {
    for (const code of codes) await stopMatch(host, code);
  }
});
