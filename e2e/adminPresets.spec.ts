/**
 * @file   e2e/adminPresets.spec.ts
 * @module e2e
 * @brief  The Presets: change "Time between numbers", a new match plays it, the History says so.
 *
 * Responsibility: the admin (dev account `dev-admin`) opens Presets, picks the battle royale,
 *                 changes "Time between numbers" with a comment and saves; the host then starts a
 *                 match the old way (interval empty) and it runs on the new interval; the History
 *                 shows the change in seconds. The page fits 1280×720 and a 390×844 phone at 100,
 *                 125 and 150 % (./acceptance/fitProbe). It changes a published preset of the whole
 *                 server, so it runs alone after the other specs of its browser (TIMING); interval
 *                 restored and match aborted at the end, also on failure. Chromium saves
 *                 admin-3-presets-*.
 * Depends on:     @playwright/test, ./realGame, ./screens, ./acceptance/fitProbe
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §8 (b), §9 piece 3
 */
import { expect, test, type Page } from '@playwright/test';
import { captureLook } from '@seasonal/kit/testing';

import { probe } from './acceptance/fitProbe.js';
import { closeContexts, hostMatch, post, signIn, stopMatch } from './realGame.js';
import { SHOTS_DIR } from './screens.js';

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const PRESET = '/api/v1/admin/presets/royale-realtime';
const INTERVAL = 'draws.intervalMsRealtime';

// Both sizes at 100, 125 and 150 %: nothing small, cut, covered or wider than the window.
async function expectFits(page: Page): Promise<void> {
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    for (const font of [16, 20, 24]) {
      await page.setViewportSize(size);
      // From the top: the sticky bar covers what is scrolled under it, which is no overlap.
      await page.evaluate((px) => {
        document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
        window.scrollTo(0, 0);
      }, font);
      const p = await probe(page);
      const what = `${String(size.width)} px at ${String(font)} px`;
      expect([p.smallText, p.cut, p.overlaps, p.hScroll], what).toEqual([[], [], [], false]);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
}

// The preset's interval now, in ms.
async function intervalNow(page: Page): Promise<number> {
  const r = await page.request.get('/api/v1/admin/presets');
  const { presets } = (await r.json()) as {
    presets: { id: string; fields: { path: string; value: number }[] }[];
  };
  const royale = presets.find((p) => p.id === 'royale-realtime');
  return royale?.fields.find((f) => f.path === INTERVAL)?.value ?? -1;
}

test('an admin changes a preset and the next match plays it', async ({ browser }, info) => {
  const shots = info.project.name.startsWith('chromium');
  const admin = await (await browser.newContext()).newPage();
  const host = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin');
  await signIn(host, 'host');
  const before = await intervalNow(admin);
  const next = before === 7_000 ? 8_000 : 7_000;
  let code: string | null = null;
  try {
    await admin.goto('/#/admin/presets');
    await admin.getByTestId('preset-pick').selectOption('royale-realtime');
    await admin.getByRole('button', { name: 'Draws and timing' }).click();
    await admin.getByLabel('Time between numbers').fill(String(next / 1000));
    await admin.getByTestId('preset-comment').fill('Slower evenings');
    await admin.getByTestId('preset-save').click();
    await expect(admin.getByRole('status')).toHaveText('Saved. New matches use these rules.');
    await expectFits(admin);
    // The rules are what the review looks at: the changed value in view.
    const row = admin.getByTestId('preset-draws-intervalMsRealtime');
    if (shots) await captureLook(admin, SHOTS_DIR, 'admin-3-presets', row);
    code = await hostMatch(host, {
      title: 'Preset interval',
      gameType: 'royale',
      drawMode: 'auto',
      missed: 'noAutoMark',
      maxPlayers: 4,
    });
    const summary = (await (await host.request.get(`/api/v1/matches/${code}`)).json()) as {
      settings: { drawIntervalMs: number };
    };
    expect(summary.settings.drawIntervalMs).toBe(next);
    await admin.getByRole('link', { name: 'History', exact: true }).click();
    await expect(admin.locator('[data-testid^="admin-history-"]').first()).toContainText(
      `Time between numbers: ${String(before / 1000)} s → ${String(next / 1000)} s`,
    );
  } finally {
    if (code !== null) await stopMatch(host, code);
    await post(admin, PRESET, { values: { [INTERVAL]: before } });
  }
});
