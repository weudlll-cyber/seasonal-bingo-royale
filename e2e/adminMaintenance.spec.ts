/**
 * @file   e2e/adminMaintenance.spec.ts
 * @module e2e
 * @brief  Maintenance on and off from the admin area's Overview, without the server's CLI.
 *
 * Responsibility: the admin (development account `dev-admin`) turns maintenance on with a
 *                 reason on the Overview; a player's lobby shows the maintenance page with that
 *                 reason; the admin turns it off and the lobby is back. It switches the whole
 *                 server, so it runs alone after the other specs of its browser (TIMING in
 *                 ./playwright.config); maintenance is switched off at the end, also on failure.
 *                 Chromium saves admin-1-maintenance-<desktop|phone>-<light|dark>.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./menu
 * Spec:           docs/concepts/admin-area.md §4 (Overview), §9 piece 1; docs/spec/09-deployment-architecture.md §4
 */
import { expect, test } from '@playwright/test';

import { closeContexts, post, signIn } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const REASON = 'Update tonight, back at 23:30';

test('an admin turns maintenance on and off from the Overview', async ({ browser }, info) => {
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  const player = await (await browser.newContext()).newPage();
  await signIn(player, 'player-1');
  try {
    await admin.goto('/#/admin');
    await expect(admin.getByTestId('admin-maintenance-state')).toHaveText('Maintenance is off');
    await admin.getByTestId('admin-maintenance-reason').fill(REASON);
    await admin.getByTestId('admin-maintenance-toggle').click();
    await expect(admin.getByTestId('admin-maintenance-state')).toHaveText(
      `Maintenance is on: ${REASON}`,
    );
    if (info.project.name.startsWith('chromium')) {
      await captureLook(admin, SHOTS_DIR, 'admin-1-maintenance');
    }
    // The player's lobby is open already (the sign-in went there): a reload asks again.
    await player.reload();
    await expect(player.getByTestId('maintenance-page')).toBeVisible({ timeout: 20_000 });
    await expect(player.getByTestId('maintenance-reason')).toHaveText(REASON);
    await admin.getByTestId('admin-maintenance-toggle').click();
    await expect(admin.getByTestId('admin-maintenance-state')).toHaveText('Maintenance is off');
    await player.reload();
    await expect(player.getByTestId('maintenance-page')).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await post(admin, '/api/v1/admin/maintenance', { on: false });
  }
});
