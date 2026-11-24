/**
 * @file   e2e/eliminatedPlayer.spec.ts
 * @module e2e
 * @brief  An eliminated player cannot mark a cell: the browser side of a rule the server holds.
 *
 * Responsibility: a royale with the fast test rules and 8 players, the host drawing on a timer:
 *                 player 1 joins, never taps and so scores nothing in the qualification round,
 *                 which cuts them. Before the cut their card is tappable (`owner-cell-*`, tap
 *                 feedback line). After it the cut screen says "You're out in cut 1"; in the next
 *                 round, with numbers drawn, their screen shows no own card cell and no tap
 *                 feedback, only the watched cards (display only); clicking a watched cell
 *                 changes nothing, and the page sends no `mark` intent at any time after the cut
 *                 (frames of the page's socket). The server refusing the mark is tested there
 *                 (`MARK_REJECTED`, packages/application engine tests); this is the screen. The
 *                 match is aborted at the end (test cleanup).
 * Depends on:     @playwright/test, ./realGame (signIn, hostMatch, joinFromLobby, fillAndStart,
 *                 stopMatch, closeContexts)
 * Spec:           docs/spec/01-game-design.md §6, §7.4, §13 (D24); docs/BACKLOG.md T4
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

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// The intents the page sends over its socket, by name (socket.io frames: 42["intent",{"type":..}]).
function recordMarks(page: Page): { count: () => number } {
  let marks = 0;
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      if (typeof frame.payload === 'string' && /"type":"mark"/.test(frame.payload)) marks += 1;
    });
  });
  return { count: () => marks };
}

test('an eliminated player has no card to tap and sends no mark', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  await signIn(player, 'player-1');
  // Noting the page's sent frames from before the match: the count after the cut is compared
  // with the count at the cut.
  const sent = recordMarks(player);
  const code = await hostMatch(host, {
    title: 'Eliminated cannot mark',
    gameType: 'royale',
    drawMode: 'auto',
    intervalSec: 4,
    // Nothing is marked for a player who does not tap: they stay at 0 points.
    missed: 'noAutoMark',
    // The host starts each next round, so the test reads the cut screen before round 2.
    pause: 'host',
    fast: true,
  });
  try {
    await joinFromLobby(player, code);
    await fillAndStart(host, 8);

    // In: the card is tappable (cells are buttons, the tap feedback line is there).
    await expect(player.getByTestId('owner-cell-0')).toBeVisible({ timeout: 30_000 });
    await expect(player.getByTestId('card-feedback').first()).toBeVisible();

    // The qualification round's 12 draws, then the cut puts the idle player out.
    await expect(player.getByTestId('cut-screen')).toContainText("You're out in cut 1", {
      timeout: 120_000,
    });
    const atCut = sent.count();

    // The host starts round 2; the player watches it.
    await host.getByTestId('host-next-round').click();
    await expect(player.getByTestId('watch-cards')).toBeVisible({ timeout: 30_000 });
    await expect(player.getByTestId('draw-ticker').locator(':scope > *').nth(1)).toBeAttached({
      timeout: 30_000,
    });

    // Out: no cell of their own, no tap line; the watched cards are not controls.
    await expect(player.locator('[data-testid^="owner-cell-"]')).toHaveCount(0);
    await expect(player.getByTestId('card-feedback')).toHaveCount(0);
    const watched = player.locator('[data-testid^="watch-card-"]').first();
    await expect(watched.locator('button')).toHaveCount(0);

    // Clicking a watched cell changes nothing and sends nothing.
    const markedBefore = await player.locator('[data-marked="true"]').count();
    await watched.locator('[data-marked]').first().click();
    await player.waitForTimeout(1_000);
    expect(await player.locator('[data-marked="true"]').count()).toBe(markedBefore);
    expect(sent.count(), 'mark intents sent from the page after the cut').toBe(atCut);
  } finally {
    await stopMatch(host, code);
  }
});
