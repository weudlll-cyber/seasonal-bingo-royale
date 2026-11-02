/**
 * @file   e2e/verifyMatch.spec.ts
 * @module e2e
 * @brief  "Verify this match" in the browser: from the final screen and from the cancelled page.
 *
 * Responsibility: a classic match (one row wins) played to its end with 60 bots and timed
 *                 draws at the shortest gap the rules allow (the server draws; host draws
 *                 waited ~5 s per number and the browser's round trips added more, ~25 numbers
 *                 in all): while it runs the verify page says the seed comes after the end; at
 *                 the end the console's "Verify this match" opens the page, which says everything
 *                 matches and shows the commitment, the seed and the round. A cancelled match
 *                 reaches the same page from its cancelled page. In Chromium the page is saved
 *                 at desktop and phone size in both themes.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §9, §13
 */
import { expect, test } from '@playwright/test';

import { closeContexts, fillAndStart, hostMatch, post, signIn, stopMatch } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('verify a finished match from the final screen', async ({ browser }, info) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  const host = await context.newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Verify me',
    gameType: 'classic',
    prizes: ['rows-1'],
    // Timed draws every 4 s: the shortest gap (the 3 s speed window + 1 s, D12).
    drawMode: 'auto',
    intervalSec: 4,
    missed: 'noAutoMark',
    // More cards, an earlier first row: about 23 numbers on average, at most ~35.
    maxPlayers: 60,
  });
  try {
    await fillAndStart(host, 60);
    // Before the end the seed stays sealed.
    const early = await context.newPage();
    await early.goto(`/#/verify/${code}`);
    await expect(early.getByTestId('verify-not-over')).toBeVisible();
    await expect(early.getByTestId('verify-seed')).toHaveCount(0);
    await early.close();
    // The server draws until the first row ends the match (at most ~35 numbers × 4 s).
    const end = host.getByTestId('end-actions');
    await expect(end).toBeVisible({ timeout: 180_000 });
    await host.getByTestId('verify-link').click();
    const verdict = host.getByTestId('verify-verdict');
    await expect(verdict).toHaveAttribute('data-verified', 'true');
    await expect(verdict).toContainText('Everything matches');
    await expect(host.getByTestId('verify-seed')).toHaveText(/^[0-9a-f]{64}$/);
    await expect(host.getByTestId('verify-commitment')).toHaveText(/^[0-9a-f]{64}$/);
    await expect(host.getByTestId('verify-round')).toHaveCount(1);
    if (info.project.name === 'chromium') await captureLook(host, SHOTS_DIR, 'verify-page');
  } finally {
    await stopMatch(host, code);
  }
});

test('verify a cancelled match from its cancelled page', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Cancelled, then verified',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'noAutoMark',
  });
  await post(host, `/api/v1/matches/${code}/abort`, { reason: 'Power cut in the hall' });
  await host.goto(`/#/match/${code}`);
  await expect(host.getByTestId('match-cancelled')).toBeVisible();
  await host.getByTestId('verify-link').click();
  await expect(host.getByTestId('verify-verdict')).toHaveAttribute('data-verified', 'true');
  await expect(host.getByTestId('verify-page')).toContainText('No round was played');
});
