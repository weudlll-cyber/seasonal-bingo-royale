/**
 * @file   e2e/acceptance/asyncScreens.spec.ts
 * @module e2e/acceptance
 * @brief  An asynchronous royale as the owner tries it, with its screenshots (WP-14, D31).
 *
 * Responsibility: a running asynchronous royale (a dev player and bots): the player's screen
 *                 without speed window or speed bar and with "In progress" (async-player-*);
 *                 the console with minutes and "Jump ahead" (async-console-jump-*); a day later,
 *                 the player's "While you were away" (async-away-summary-*). An asynchronous
 *                 lobby with one player, a day later: the cancelled-match page with "Too few
 *                 players joined within 24 hours" (async-lobby-cancelled-*). An asynchronous
 *                 lobby says when it starts or closes, in the waiting room and the console
 *                 (async-lobby-closes-*, D34). Desktop and phone, both themes. Every match is
 *                 aborted afterwards. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../realGame, ../screens
 * Spec:           docs/spec/01-game-design.md §7.6 (D31, D33, D34), §11
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { closeContexts, post, signIn, stopMatch } from '../realGame.js';
import { captureLook, SHOTS_DIR } from '../screens.js';

const ASYNC = {
  title: 'Slow royale',
  gameType: 'royale',
  mode: 'async',
  drawMode: 'auto',
  missedNumbers: { kind: 'noAutoMark' },
  maxPlayers: 10,
  quietHours: null,
  timeZone: 'Europe/Berlin',
};

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// A new asynchronous match the dev player joined; returns its code.
async function asyncMatch(host: Page, player: Page, title: string): Promise<string> {
  const created = await post(host, '/api/v1/matches', { ...ASYNC, title });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  expect((await post(player, `/api/v1/matches/${code}/join`, {})).ok()).toBe(true);
  return code;
}

// A fresh console (no note from an earlier jump); a day of 15-minute draws takes the server
// a few seconds, more with screens open. Done when the note says so, or `done` shows (a
// match that ended meanwhile has no buttons and no note).
async function jump(host: Page, code: string, label: '1 hour' | '1 day', done?: Locator) {
  await host.goto(`/#/host/${code}`);
  await host.reload();
  await host.getByRole('button', { name: `Jump ahead ${label}` }).click();
  const finished = done ?? host.getByTestId('jump-note').filter({ hasText: `Jumped ${label}` });
  await expect(finished).toBeVisible({ timeout: 60_000 });
}

test('an asynchronous match: player, console, away summary, lobby cancelled', async ({
  browser,
}) => {
  test.setTimeout(10 * 60_000);
  const host = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  await signIn(player, 'player-1');
  const codes: string[] = [];
  try {
    const code = await asyncMatch(host, player, 'Slow royale');
    codes.push(code);
    expect((await post(host, `/api/v1/matches/${code}/bots`, { upTo: 10 })).ok()).toBe(true);
    expect((await post(host, `/api/v1/matches/${code}/start`, {})).ok()).toBe(true);
    // Through the countdown and a few numbers, so the player screen has something to show.
    await jump(host, code, '1 hour');
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('current-ball')).toHaveAttribute('data-item', /\d+/);
    await expect(player.locator('.sbr-badge-live')).toHaveText('In progress');
    // The first visit may already summarise the hour; the picture shows the screen itself.
    const dismiss = player.getByTestId('away-dismiss');
    if (await dismiss.isVisible()) await dismiss.click();
    await captureLook(player, SHOTS_DIR, 'async-player');
    await captureLook(host, SHOTS_DIR, 'async-console-jump', host.getByTestId('jump-ahead'));
    // The player is away (in the lobby) while the day passes, then comes back.
    await player.goto('/#/');
    await jump(host, code, '1 day');
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('away-summary')).toBeVisible();
    await captureLook(player, SHOTS_DIR, 'async-away-summary', player.getByTestId('away-summary'));
    // A lobby with one player when its 24 hours are over (D31).
    const lonely = await asyncMatch(host, player, 'Nobody came');
    codes.push(lonely);
    await jump(host, lonely, '1 day', host.getByTestId('match-cancelled'));
    await player.goto(`/#/match/${lonely}`);
    await expect(player.getByTestId('match-cancelled')).toContainText(
      'Too few players joined within 24 hours',
    );
    await captureLook(player, SHOTS_DIR, 'async-lobby-cancelled');
  } finally {
    for (const c of codes) await stopMatch(host, c);
  }
});

test('an asynchronous lobby says when it starts or closes (D34)', async ({ browser }) => {
  test.setTimeout(3 * 60_000);
  const host = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  await signIn(player, 'player-1');
  const code = await asyncMatch(host, player, 'Royale by the week');
  try {
    const closes = /^Starts or closes (at|on .+ at) \d\d:\d\d \(in 1 day\)$/;
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('registration')).toHaveText(closes);
    await captureLook(player, SHOTS_DIR, 'async-lobby-closes');
    await host.goto(`/#/host/${code}`);
    await expect(host.getByTestId('host-start-rule')).toHaveText(closes);
    await captureLook(host, SHOTS_DIR, 'async-lobby-closes-console');
  } finally {
    await stopMatch(host, code);
  }
});
