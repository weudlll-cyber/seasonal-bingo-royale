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
 *                 sees the arena with standings; offline for two draws, the player's screen
 *                 catches up after reconnecting and keeps its marks.
 * Depends on:     @playwright/test, ./realGame
 * Spec:           docs/spec/12-testing-strategy.md §4 (journey 1, draft); docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import { expect, test } from '@playwright/test';

import {
  currentItem,
  drawNext,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
} from './realGame.js';

test('host and player share one live match', async ({ browser }) => {
  test.setTimeout(120_000);
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

  // Reconnect and resync (06 §1, §4): the player drops off while the host draws on; back
  // online, the screen catches up with the same numbers and keeps the marks it had.
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
});
