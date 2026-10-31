/**
 * @file   e2e/acceptance/pauseScreens.spec.ts
 * @module e2e/acceptance
 * @brief  Screenshots of a timed pause between royale rounds (D21) for the host and a player.
 *
 * Responsibility: a royale (fast test profile, host draws, two-minute pause): player 1
 *                 joins, bots fill the field, the host draws through round 1. In the pause
 *                 the console offers "Start next round now" without Draw next or its line,
 *                 the player sees "Round over" for the last number, and neither ticker
 *                 highlights a newest number. Both are saved light and dark at 1280×800 and
 *                 390×844 to reports/screens/latest/pause-<host|player>-<size>-<theme>.jpg.
 *                 The host ends the pause: round 2 starts on both screens; the match is
 *                 stopped. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../realGame, ../screens
 * Spec:           docs/spec/01-game-design.md §7 (D20, D21)
 */
import { expect, test, type Page } from '@playwright/test';

import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
  stopMatch,
} from '../realGame.js';
import { captureLook, DESKTOP, SHOTS_DIR } from '../screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// The host draws until the pause after the first round offers "Start next round now".
async function drawToPause(host: Page): Promise<void> {
  const now = host.getByTestId('host-next-round-now');
  const ready = host.locator('[data-testid="host-draw-next"]:enabled');
  for (let i = 0; i < 40; i += 1) {
    // After the round's last draw Draw next stays off until the pause begins.
    await expect(ready.or(now).first()).toBeVisible({ timeout: 15_000 });
    if ((await now.count()) > 0) return;
    await drawNext(host);
  }
  throw new Error('the pause did not come');
}

test('a timed pause on the host console and a player screen, ended early by the host', async ({
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const host = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  const player = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(host, 'host');
  await signIn(player, 'player-1');
  const code = await hostMatch(host, {
    title: 'Pause screens',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'noAutoMark',
    pause: 120,
    maxPlayers: 8,
    fast: true,
  });
  try {
    await joinFromLobby(player, code);
    await host.goto(`/#/host/${code}`);
    await fillAndStart(host, 8);
    await drawToPause(host);
    const now = host.getByTestId('host-next-round-now');
    await expect(host.getByTestId('host-draw-next')).toHaveCount(0);
    await expect(host.getByText(/Draw next opens/)).toHaveCount(0);
    await expect(player.getByTestId('current-ball')).toHaveText('Round over', { timeout: 10_000 });
    // The ticker highlights no number as the newest during the pause (it read as "tap now").
    await expect(host.getByTestId('draw-newest')).toHaveCount(0);
    await expect(player.getByTestId('draw-newest')).toHaveCount(0);
    await captureLook(host, SHOTS_DIR, 'pause-host', host.getByTestId('host-next-round-panel'));
    await captureLook(player, SHOTS_DIR, 'pause-player', player.getByTestId('current-ball'));
    await now.click();
    // Round 2 starts for everyone at once, long before the two minutes are up.
    await expect(now).toHaveCount(0, { timeout: 5_000 });
    await expect(player.getByTestId('current-ball')).not.toHaveText('Round over', {
      timeout: 5_000,
    });
  } finally {
    await stopMatch(host, code);
  }
});
