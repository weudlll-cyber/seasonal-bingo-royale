/**
 * @file   e2e/startMatch.spec.ts
 * @module e2e
 * @brief  "Start a match": the Organizer's three steps, the summary line, the lobby from a preset.
 *
 * Responsibility: the organizer (development account `dev-host`) opens "Host a match": game
 *                 type, preset and this match on one page; picks the royale, "Quick", reads the
 *                 summary line and opens the lobby; the match runs on the preset's quick
 *                 interval. The page fits 1280×720 and a 390×844 phone at 100, 125 and 150 % (no
 *                 text below 14 px, nothing cut, covered or wider than the window,
 *                 ./fits), "More choices" open. The admin's Presets page shows
 *                 the tab "For the organizer". The match is aborted at the end. Chromium saves
 *                 admin-4-start-* and admin-4-organizer-*.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./fits
 * Spec:           docs/concepts/admin-area.md §3, §4 (Presets), §8 (g), (h), §9 piece 4
 */
import { expect, test } from '@playwright/test';
import { captureLook } from '@seasonal/kit/testing';

import { expectFits } from './fits.js';
import { closeContexts, signIn, stopMatch } from './realGame.js';
import { SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('an organizer starts a match in three steps from a preset', async ({ browser }, info) => {
  const shots = info.project.name.startsWith('chromium');
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const presets = (await (await host.request.get('/api/v1/presets')).json()) as {
    presets: { id: string; speedsMs: { quick: number } }[];
  };
  const quick = presets.presets.find((p) => p.id === 'royale-realtime')?.speedsMs.quick;
  let code: string | null = null;
  try {
    await host.goto('/#/host/new');
    await expect(host.getByRole('heading', { name: 'Start a match' })).toBeVisible();
    await host.getByTestId('start-type-royale').click();
    await host.getByTestId('start-preset-royale-realtime').click();
    await host.getByTestId('start-title').fill('Friday royale');
    await host.getByTestId('start-speed-quick').click();
    await expect(host.getByTestId('start-summary')).toContainText('up to 20 players');
    await host.getByTestId('start-more').click();
    await expectFits(host, 'start a match');
    if (shots) await captureLook(host, SHOTS_DIR, 'admin-4-start');
    await host.getByTestId('create-submit').click();
    await expect(host.getByTestId('host-console')).toBeVisible();
    code = (await host.getByTestId('host-code').innerText()).trim();
    const summary = (await (await host.request.get(`/api/v1/matches/${code}`)).json()) as {
      settings: { drawIntervalMs: number };
    };
    expect(summary.settings.drawIntervalMs).toBe(quick);
  } finally {
    if (code !== null) await stopMatch(host, code);
  }
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  await admin.goto('/#/admin/presets');
  await admin.getByTestId('preset-pick').selectOption('royale-realtime');
  await expect(admin.getByRole('button', { name: 'For the organizer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const quickRow = admin.getByTestId('preset-organizer-speedsMs-quick');
  await expect(quickRow).toContainText('Quick');
  if (shots) await captureLook(admin, SHOTS_DIR, 'admin-4-organizer', quickRow);
});
