/**
 * @file   e2e/adminScreens.spec.ts
 * @module e2e
 * @brief  "Screens and texts": fewer standings rows, seen in a match after the page reloads.
 *
 * Responsibility: the admin (development account `dev-admin`) opens "Screens and texts", sets
 *                 "Standings rows" to 5 with a comment and saves; a match with 10 players runs;
 *                 after a reload the host's live standings list 5 rows (the players' next page
 *                 load, admin-area §8 (i)). The page fits 1280×720 and a 390×844 phone at 100,
 *                 125 and 150 % (./fits). It changes what every player sees, so
 *                 it runs alone after the other specs of its browser (TIMING); the value is put
 *                 back and the match aborted at the end, also on failure. Chromium saves
 *                 admin-6-screens-*.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./fits
 * Spec:           docs/concepts/admin-area.md §4 (Screens and texts), §8 (i), §9 piece 6
 */
import { expect, test } from '@playwright/test';
import { captureLook } from '@seasonal/kit/testing';

import { expectFits } from './fits.js';
import { closeContexts, fillAndStart, hostMatch, post, signIn, stopMatch } from './realGame.js';
import { SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('fewer standings rows reach a match at its next page load', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const shots = info.project.name.startsWith('chromium');
  const admin = await (await browser.newContext()).newPage();
  const host = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  await signIn(host, 'host');
  let code: string | null = null;
  try {
    await admin.goto('/#/admin/screens');
    await admin.getByLabel('Standings rows').fill('5');
    await admin.getByTestId('screens-comment').fill('Short lists');
    await admin.getByTestId('screens-save').click();
    await expect(admin.getByRole('status')).toContainText('next page load');
    await expectFits(admin, 'admin screens');
    if (shots)
      await captureLook(
        admin,
        SHOTS_DIR,
        'admin-6-screens',
        admin.getByTestId('screens-standingsRows'),
      );
    code = await hostMatch(host, {
      title: 'Short standings',
      gameType: 'royale',
      drawMode: 'host',
      missed: 'noAutoMark',
      maxPlayers: 12,
    });
    await fillAndStart(host, 10);
    await host.reload();
    await expect(host.getByTestId('standings').locator('[data-testid^="standing-"]')).toHaveCount(
      5,
    );
  } finally {
    if (code !== null) await stopMatch(host, code);
    await post(admin, '/api/v1/admin/screens', { values: { standingsRows: 20 } });
  }
});
