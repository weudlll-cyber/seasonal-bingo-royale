/**
 * @file   e2e/acceptance/interludeScreens.spec.ts
 * @module e2e/acceptance
 * @brief  Screenshots of every round recap card (D20) for the host and a player, both themes and sizes.
 *
 * Responsibility: a royale with the published default rules and "the host starts the next round"
 *                 (D14): player 1 taps each number at once (so the recap names a fastest tapper),
 *                 bots fill the field, the host draws through two rounds to the pause after the
 *                 cut. There, on host console and player screen, every recap card is shown in
 *                 turn (stepped with Next, which restarts its time) and saved light and dark at
 *                 1280×800 and 390×844 to reports/screens/latest/ as
 *                 interlude-<card>-<host|player>-<desktop|phone>-<light|dark>.jpg. The match is
 *                 stopped at the end. Runs only with SBR_ACCEPTANCE=1 (about ten minutes).
 * Depends on:     @playwright/test, ../realGame, ../screens
 * Spec:           docs/spec/01-game-design.md §7 (D14, D20), §13
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
} from '../realGame.js';
import { captureThemes, DESKTOP, PHONE, SHOTS_DIR } from '../screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// The player taps the number just drawn, if it is on their card (inside its speed window).
async function tapNewest(host: Page, player: Page): Promise<void> {
  const item = await currentItem(host);
  if (item === null) return;
  await expect(player.getByTestId('current-ball')).toHaveAttribute('data-item', String(item), {
    timeout: 3_000,
  });
  const cell = player.locator(
    `[data-testid^="owner-cell-"][data-value="${String(item)}"][data-marked="false"]`,
  );
  if ((await cell.count()) > 0) await cell.first().click();
}

// Plays until the match waits for its host for the `pause`-th time.
async function playToPause(host: Page, player: Page, pause: number): Promise<void> {
  let pauses = 0;
  const next = host.getByTestId('host-next-round');
  const ready = host.locator('[data-testid="host-draw-next"]:enabled');
  for (let i = 0; i < 120; i += 1) {
    // After a round's last draw Draw next stays off until Start next round appears.
    await expect(ready.or(next).first()).toBeVisible({ timeout: 15_000 });
    if ((await next.count()) > 0) {
      pauses += 1;
      if (pauses === pause) return;
      await host.getByTestId('host-next-round').click();
      await expect(host.getByTestId('host-next-round')).toHaveCount(0, { timeout: 10_000 });
      continue;
    }
    await drawNext(host);
    await tapNewest(host, player);
  }
  throw new Error('the pause did not come');
}

// Steps to card `k` with Next (the cards go round while the host decides).
async function showCard(page: Page, k: number): Promise<string> {
  const step = await page.getByTestId('interlude-step').innerText();
  const [, now = '1', count = '1'] = /^Card (\d+) of (\d+)$/.exec(step) ?? [];
  const clicks = (k - (Number(now) - 1) + Number(count)) % Number(count);
  for (let i = 0; i < clicks; i += 1) await page.getByTestId('interlude-next').click();
  await expect(page.getByTestId('interlude-step')).toHaveText(`Card ${String(k + 1)} of ${count}`);
  const card = await page.locator('[data-testid^="interlude-card-"]').getAttribute('data-testid');
  return (card ?? '').replace('interlude-card-', '');
}

async function shootCards(page: Page, role: string): Promise<string[]> {
  const step = await page.getByTestId('interlude-step').innerText();
  const count = Number(/of (\d+)$/.exec(step)?.[1] ?? '1');
  const cards: string[] = [];
  for (const [size, viewport] of [
    ['desktop', DESKTOP],
    ['phone', PHONE],
  ] as const) {
    await page.setViewportSize(viewport);
    for (let k = 0; k < count; k += 1) {
      const card = await showCard(page, k);
      if (size === 'desktop') cards.push(card);
      const name = `interlude-${card}-${role}-${size}`;
      await captureThemes(page, SHOTS_DIR, name, page.getByTestId('interlude'));
    }
  }
  return cards;
}

test('every round recap card, host and player, both themes and sizes', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const host = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  const player = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(host, 'host');
  await signIn(player, 'player-1');
  const code = await hostMatch(host, {
    title: 'Recap screens',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'noAutoMark',
    pause: 'host',
    maxPlayers: 12,
  });
  try {
    await joinFromLobby(player, code);
    await host.goto(`/#/host/${code}`);
    await fillAndStart(host, 12);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    // The first stage has two rounds; its cut follows the second.
    await playToPause(host, player, 2);
    await expect(player.getByTestId('interlude')).toBeVisible({ timeout: 10_000 });
    const hostCards = await shootCards(host, 'host');
    const playerCards = await shootCards(player, 'player');
    // Evidence for the report, in the form of the other specs: TAG, the match, the facts.
    console.log(`INTERLUDE ${code} ${JSON.stringify({ hostCards, playerCards })}`);
    expect(hostCards).toContain('cut');
    expect(playerCards).toEqual(hostCards);
  } finally {
    await stopMatch(host, code);
  }
});
