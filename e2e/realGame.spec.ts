/**
 * @file   e2e/realGame.spec.ts
 * @module e2e
 * @brief  The real game in the browser: host creates, player joins, bots fill, host draws.
 *
 * Responsibility: a short end-to-end path through the live match (WP-09 to WP-13): the
 *                 host signs in with the quick sign-in and creates a classic match with host
 *                 draws; player 1 joins from the lobby and waits in the waiting room; the
 *                 host fills the match with bots and starts it; after the countdown both
 *                 screens show the same current number for every Draw next, and the player
 *                 sees the arena with standings; the player taps the drawn numbers on the
 *                 card, goes offline for two draws, catches up after reconnecting, keeps its
 *                 marks and taps again (one cell a second time, refused): the server holds
 *                 one mark per tapped cell, the same the screen shows. The match is stopped
 *                 in teardown, also when a step fails.
 * Depends on:     @playwright/test, ./realGame
 * Spec:           docs/spec/12-testing-strategy.md §4 (journey 1, draft); docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import { expect, test, type Page } from '@playwright/test';

import {
  closeContexts,
  currentItem,
  drawNext,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
  stopMatch,
} from './realGame.js';

// The player's cells holding a drawn number not marked yet ("leave open": still tappable).
const openDrawn = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const drawn = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="draw-ticker"] > *'),
    ].map((el) => el.dataset['item']);
    return [...document.querySelectorAll<HTMLElement>('[data-testid^="owner-cell-"]')]
      .filter((el) => el.dataset['marked'] !== 'true' && drawn.includes(el.dataset['value']))
      .map((el) => el.dataset['testid'] ?? '');
  });

async function tapOpen(page: Page): Promise<string[]> {
  const open = await openDrawn(page);
  for (const id of open) {
    await page.getByTestId(id).click();
    await expect(page.getByTestId(id)).toHaveAttribute('data-marked', 'true');
  }
  return open;
}

// The player's marks the server recorded, as "card:cell".
async function serverMarks(page: Page, code: string): Promise<string[]> {
  const body = (await (await page.request.get(`/api/v1/matches/${code}/state`)).json()) as {
    me: string;
    view: {
      events: { type: string; accountId?: string; cardIndex?: number; cellIndex?: number }[];
    };
  };
  return body.view.events
    .filter((e) => e.type === 'cellMarked' && e.accountId === body.me)
    .map((e) => `${String(e.cardIndex)}:${String(e.cellIndex)}`);
}

// Contexts this spec opens are closed after every test (see closeContexts).
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('host and player share one live match', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: `Smoke ${String(Date.now())}`,
    gameType: 'classic',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 6,
  });
  try {
    await signIn(player, 'player-1');
    await joinFromLobby(player, code);
    await host.goto(`/#/host/${code}`);
    await fillAndStart(host, 6);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    const seen: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      await drawNext(host);
      // The player's screen shows the host's new number.
      await expect
        .poll(async () => {
          const mine = await currentItem(player);
          return mine !== null && !seen.includes(mine) && mine === (await currentItem(host));
        })
        .toBe(true);
      seen.push((await currentItem(player)) ?? -1);
    }
    await expect(player.getByTestId('standings').locator('li')).toHaveCount(6);
    await tapOpen(player);

    await reconnectAndTap(host, player, code);
  } finally {
    // The match is stopped, also when a step above failed.
    await stopMatch(host, code);
  }
});

// Reconnect and resync (06 §1, §4): the player drops off while the host draws on; back
// online, the screen catches up with the same numbers, keeps the marks it had and taps on.
async function reconnectAndTap(host: Page, player: Page, code: string): Promise<void> {
  const markedBefore = await player
    .locator('[data-testid^="owner-cell-"][data-marked="true"]')
    .count();
  await player.context().setOffline(true);
  await drawNext(host);
  await drawNext(host);
  await player.context().setOffline(false);
  const hostTicker = () => host.getByTestId('draw-ticker').locator(':scope > *').count();
  await expect
    .poll(async () => player.getByTestId('draw-ticker').locator(':scope > *').count(), {
      timeout: 30_000,
    })
    .toBe(await hostTicker());
  expect(await currentItem(player)).toBe(await currentItem(host));
  const markedAfter = await player
    .locator('[data-testid^="owner-cell-"][data-marked="true"]')
    .count();
  expect(markedAfter).toBeGreaterThanOrEqual(markedBefore);

  // Taps after the reconnect: until one of the card's numbers is drawn, the host draws on;
  // a second tap on a marked cell must not add a mark (12 §4 journey 8).
  for (let i = 0; i < 15 && (await openDrawn(player)).length === 0; i += 1) await drawNext(host);
  const tapped = await tapOpen(player);
  expect(tapped.length, 'a drawn number on the card to tap').toBeGreaterThan(0);
  // The same cell once more, straight to the server (the screen never sends a second tap).
  const session = (await (await player.request.get('/api/v1/session')).json()) as {
    csrfToken: string;
  };
  const again = await player.request.post(`/api/v1/matches/${code}/marks`, {
    headers: { 'x-csrf-token': session.csrfToken },
    data: { cardIndex: 0, cell: Number((tapped[0] ?? '').replace('owner-cell-', '')) },
  });
  expect(again.status(), 'a second mark of one cell is refused').toBe(422);
  const marks = await serverMarks(player, code);
  expect(new Set(marks).size, 'no cell marked twice').toBe(marks.length);
  // The free centre counts as marked on the screen and has no event.
  const onScreen = await player.locator('[data-testid^="owner-cell-"][data-marked="true"]').count();
  expect(marks.length, 'server marks = screen marks').toBe(onScreen - 1);
}
