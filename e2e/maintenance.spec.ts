/**
 * @file   e2e/maintenance.spec.ts
 * @module e2e
 * @brief  `sbr maintenance on` in the browser: the page, the host's banner, a match that plays on.
 *
 * Responsibility: with a match running, set the server's maintenance flag (the file the
 *                 CLI writes, with a reason): the lobby shows the maintenance page and the
 *                 reason, the host console a banner, and the host still draws. A match set
 *                 to start by itself at a time stays in its lobby past that time and starts
 *                 once the flag is gone (D22, Chromium). The flag is removed and the matches
 *                 stopped afterwards, also on failure. Runs alone after the other specs of
 *                 its browser; Chromium saves page, banner and the held match at both sizes
 *                 in both themes.
 * Depends on:     @playwright/test, ./devStack, ./realGame, ./screens
 * Spec:           docs/spec/09-deployment-architecture.md §4; docs/spec/01-game-design.md §7.6 (D22), §13
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { REPO_ROOT } from './devStack.js';
import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  post,
  signIn,
  stopMatch,
} from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

// The server runs in apps/server with SBR_DATA_DIR ./data (apps/server/src/config/env.ts).
const FLAG = path.join(REPO_ROOT, 'apps', 'server', 'data', 'maintenance');
const REASON = 'Database upgrade, back at 22:00';

// What the server says about maintenance (it reads the flag at most every 2 s).
const maintenanceOf = async (page: Page): Promise<unknown> =>
  (await page.request.get('/api/v1/maintenance')).json() as Promise<unknown>;

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
    await expect
      .poll(() => maintenanceOf(host), { timeout: 5_000 })
      .toEqual({ on: true, reason: REASON });
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

// D22: a match set to start by itself at a time waits through maintenance and starts once
// it is off. Server behaviour, so one browser; Chromium also saves the held host console.
test('maintenance holds an automatic start until it is turned off (D22)', async ({
  browser,
}, info) => {
  test.skip(!info.project.name.startsWith('chromium'), 'server behaviour: one browser is enough');
  test.setTimeout(180_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  // The test before removed its flag; the server may still hold it for up to 2 s.
  await expect
    .poll(() => maintenanceOf(host), { timeout: 5_000 })
    .toEqual({ on: false, reason: null });
  // The earliest start time allowed: a minute ahead (01 §7.6), plus a little for the form.
  const at = Date.now() + 65_000;
  const created = await post(host, '/api/v1/matches', {
    title: 'Held by maintenance',
    gameType: 'classic',
    prizes: ['fullCard'],
    drawMode: 'host',
    missedNumbers: { kind: 'noAutoMark' },
    maxPlayers: 4,
    startRule: { kind: 'at', at, auto: true },
  });
  expect(created.status(), 'create the match').toBe(201);
  const { code } = (await created.json()) as { code: string };
  const summary = async () =>
    (await (await host.request.get(`/api/v1/matches/${code}`)).json()) as {
      status: string;
      startsAt: number | null;
    };
  try {
    await post(host, `/api/v1/matches/${code}/bots`, { upTo: 4 });
    mkdirSync(path.dirname(FLAG), { recursive: true });
    writeFileSync(FLAG, REASON);
    await expect
      .poll(() => maintenanceOf(host), { timeout: 5_000 })
      .toEqual({ on: true, reason: REASON });
    // A fresh load asks at once (an open page would within 30 s).
    await host.goto(`/#/host/${code}`);
    await host.reload();
    await expect(host.getByTestId('maintenance-banner')).toContainText(REASON);
    // Past the start time (and one check of the held start, every 5 s) it still waits.
    await expect
      .poll(() => Date.now(), { timeout: 90_000, intervals: [1_000] })
      .toBeGreaterThan(at + 6_000);
    expect(await summary()).toMatchObject({ status: 'lobby', startsAt: null, startHeld: true });
    // The console says why it waits (within its next refresh of the match).
    await expect(host.getByTestId('host-start-rule')).toHaveText(
      'Held by maintenance — starts when maintenance ends',
      { timeout: 35_000 },
    );
    await expect(host.getByTestId('host-too-few')).toHaveCount(0);
    await captureLook(host, SHOTS_DIR, 'maintenance-held');
    rmSync(FLAG, { force: true });
    // Off again: the due start runs within one check, the countdown begins.
    await expect.poll(async () => (await summary()).startsAt, { timeout: 15_000 }).not.toBeNull();
  } finally {
    rmSync(FLAG, { force: true });
    await stopMatch(host, code);
  }
});
