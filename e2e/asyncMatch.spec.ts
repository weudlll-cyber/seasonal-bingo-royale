/**
 * @file   e2e/asyncMatch.spec.ts
 * @module e2e
 * @brief  Journey 2: an asynchronous match, a day away, "While you were away" (WP-14).
 *
 * Responsibility: the host creates an asynchronous royale (API; 15-minute draws, quiet
 *                 hours around the current hour of the browser's time zone); a player joins and
 *                 the match starts with bots; the player sees the quiet-hours notice, then closes
 *                 the browser; the development time travel moves the match a day ahead; the player
 *                 comes back and the away summary counts exactly the numbers drawn in the
 *                 server's log, and Dismiss removes it. The match is aborted at the end. In
 *                 Chromium the quiet hours and the summary are saved (both sizes and
 *                 themes) to reports/screens/latest/.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/12-testing-strategy.md §4 (journey 2); docs/spec/01-game-design.md §5, §11;
 *                 docs/spec/06-realtime-architecture.md §6
 */
import { expect, test, type Page } from '@playwright/test';

import { closeContexts, fillAndStart, joinFromLobby, post, signIn, stopMatch } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

const DAY_MS = 86_400_000;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// An asynchronous royale with quiet hours from this hour for two hours, through the API (the
// Organizer's page takes quiet hours from the preset), then its console.
async function hostAsyncMatch(host: Page): Promise<string> {
  const { hour, timeZone } = await host.evaluate(() => ({
    hour: new Date().getHours(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
  const created = await post(host, '/api/v1/matches', {
    title: 'Slow royale',
    gameType: 'royale',
    mode: 'async',
    quietHours: { startHour: hour, endHour: (hour + 2) % 24 },
    timeZone,
    drawMode: 'auto',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 8,
    roundPause: { kind: 'wait', ms: 15_000 },
    startRule: { kind: 'host' },
  });
  expect(created.status()).toBe(201);
  const { code } = (await created.json()) as { code: string };
  await host.goto(`/#/host/${code}`);
  await expect(host.getByTestId('host-console')).toBeVisible();
  return code;
}

// The numbers drawn in the server's log of the match, as the player's state shows it.
async function drawsInLog(page: Page, code: string): Promise<number> {
  const state = await page.request.get(`/api/v1/matches/${code}/state`);
  const { view } = (await state.json()) as { view: { events: { type: string }[] } };
  return view.events.filter((e) => e.type === 'drawMade').length;
}

test('journey 2: a day away from an asynchronous match', async ({ browser }, info) => {
  test.setTimeout(4 * 60_000);
  const shots = info.project.name === 'chromium';
  const host = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  await signIn(player, 'player-1');
  const code = await hostAsyncMatch(host);
  try {
    await joinFromLobby(player, code);
    await fillAndStart(host, 8);
    // Quiet hours now: the first number waits for their end.
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    // "at 01:00" today, "on Tuesday 3 November at 01:00" when the end falls after midnight.
    await expect(player.getByTestId('quiet-hours')).toContainText(
      /the next number comes (at|on .+ at) \d\d:\d\d/,
    );
    if (shots) await captureLook(player, SHOTS_DIR, 'async-quiet-hours');
    await player.context().close();
    // A day later (development time travel): the match ran its draws meanwhile.
    const travel = await post(host, '/api/v1/dev/time-travel', { code, ms: DAY_MS });
    expect(travel.status()).toBe(200);
    const back = await (await browser.newContext()).newPage();
    await signIn(back, 'player-1');
    await back.goto(`/#/match/${code}`);
    const summary = back.getByTestId('away-summary');
    await expect(summary).toBeVisible({ timeout: 20_000 });
    const draws = await drawsInLog(back, code);
    expect(draws).toBeGreaterThan(50);
    await expect(summary).toHaveAttribute('data-draws', String(draws));
    await expect(summary).toContainText(`${String(draws)} numbers drawn`);
    if (shots) await captureLook(back, SHOTS_DIR, 'async-away-summary', summary);
    await back.getByTestId('away-dismiss').click();
    await expect(summary).toBeHidden();
  } finally {
    await stopMatch(host, code);
  }
});
