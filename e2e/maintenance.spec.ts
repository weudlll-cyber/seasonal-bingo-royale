/**
 * @file   e2e/maintenance.spec.ts
 * @module e2e
 * @brief  `sbr maintenance on` in the browser: the page, the host's banner, a match that plays on.
 *
 * Responsibility: with a match already running, set the server's maintenance flag (the file
 *                 the CLI writes, with a reason); the lobby shows "Maintenance — we'll be back
 *                 shortly" and the reason, the host console a banner, and the host still
 *                 draws in the running match. The flag is removed and the match stopped
 *                 afterwards, also when a step fails. Runs alone after the other specs of its
 *                 browser (the flag affects every test on the server). In Chromium the page
 *                 and the banner are saved at desktop and phone size in both themes.
 * Depends on:     @playwright/test, node:fs, ./devStack, ./realGame, ./screens
 * Spec:           docs/spec/09-deployment-architecture.md §4; docs/spec/01-game-design.md §13
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';
import { closeContexts, drawNext, fillAndStart, hostMatch, signIn, stopMatch } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

// The server runs in apps/server with SBR_DATA_DIR ./data (apps/server/src/config/env.ts).
const FLAG = path.join(REPO_ROOT, 'apps', 'server', 'data', 'maintenance');
const REASON = 'Database upgrade, back at 22:00';

test.afterEach(async ({ browser }) => {
  rmSync(FLAG, { force: true });
  await closeContexts(browser);
});

test('maintenance: the page, the host banner, and a running match that plays on', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const shots = info.project.name.startsWith('chromium');
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Running through maintenance',
    gameType: 'classic',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 4,
  });
  try {
    await fillAndStart(host, 4);
    await expect(host.getByTestId('host-status')).toHaveAttribute('data-status', 'running', {
      timeout: 20_000,
    });
    mkdirSync(path.dirname(FLAG), { recursive: true });
    writeFileSync(FLAG, REASON);
    // The server looks at the flag at most every 2 s, the client asks every 30 s and on load.
    await host.waitForTimeout(2_100);
    // A fresh load asks at once (an open page would within 30 s).
    await host.goto('/#/');
    await host.reload();
    await expect(host.getByTestId('maintenance-page')).toBeVisible();
    await expect(host.getByTestId('maintenance-reason')).toHaveText(REASON);
    if (shots) await captureLook(host, SHOTS_DIR, 'maintenance-page');
    await host.goto(`/#/host/${code}`);
    await expect(host.getByTestId('maintenance-banner')).toContainText(REASON);
    if (shots) await captureLook(host, SHOTS_DIR, 'maintenance-banner');
    // The running match goes on: the host still draws.
    await drawNext(host);
  } finally {
    rmSync(FLAG, { force: true });
    await stopMatch(host, code);
  }
});
