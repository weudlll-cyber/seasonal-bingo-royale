/**
 * @file   e2e/acceptance/testPageScreens.spec.ts
 * @module e2e/acceptance
 * @brief  The test page played end to end, with its screenshots (QUICKTEST-GUIDE).
 *
 * Responsibility: A, royale "In 1 minute", host draws, 7 bots, playing along (short royale
 *                 rounds): waiting room with the start countdown, start, taps, cut, pause
 *                 with recap ended by "Start next round now" from the console tab, result;
 *                 A, classic, timed draws, "Now": countdown, taps, result; B, the seed
 *                 simulation with seed spring-garden, classicSeasons then royale; the console's
 *                 Start match during maintenance. Saves test-match-*, simulation-running-* and
 *                 console-maintenance-start-* at both sizes in both themes. Every match is
 *                 aborted if it has not ended. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../devStack, ../realGame, ../screens, ./liveSnap
 * Spec:           docs/spec/01-game-design.md §7 (D20, D21), §7.6 (D16, D22), §13
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import { closeContexts, drawNext, hostMatch, signIn, stopMatch } from '../realGame.js';
import { captureLook, DESKTOP, SHOTS_DIR } from '../screens.js';
import { liveSnap } from './liveSnap.js';

const FLAG = path.join(REPO_ROOT, 'apps', 'server', 'data', 'maintenance');

// What the server says about maintenance (it reads the flag at most every 2 s).
async function maintenanceOn(page: Page): Promise<boolean> {
  const m = (await (await page.request.get('/api/v1/maintenance')).json()) as { on: boolean };
  return m.on;
}

test.afterEach(async ({ browser }) => {
  rmSync(FLAG, { force: true });
  await closeContexts(browser);
});

interface TestMatchChoice {
  readonly gameType: 'royale' | 'classic';
  readonly start: 'now' | 'in1';
  readonly bots: number;
  readonly drawMode: 'host' | 'auto';
}

// Section A as the owner fills it in; returns the match code.
async function createTestMatch(page: Page, c: TestMatchChoice): Promise<string> {
  await page.goto('/#/quicktest');
  await page.getByTestId('test-match-sign-in-host').click({ timeout: 20_000 });
  await page.getByTestId('test-match-game-type').selectOption(c.gameType);
  await page.getByTestId('test-match-start').selectOption(c.start);
  await page.getByTestId('test-match-bots').fill(String(c.bots));
  // The draw choice exists in both sections of the page: section A's.
  await page.getByTestId('test-match-form').getByTestId('start-draw-mode').selectOption(c.drawMode);
  if (c.gameType === 'royale') await page.getByTestId('test-match-fast').check();
  await page.getByTestId('test-match-create').click();
  await expect(page.getByTestId('waiting-room')).toBeVisible({ timeout: 20_000 });
  return (await page.getByTestId('test-match-code').textContent()) ?? '';
}

// The owner taps the current number when it is on their card and still open.
async function tapCurrent(owner: Page): Promise<void> {
  const s = await liveSnap(owner);
  const cell = s.cells.find((x) => x.value === s.item && !x.marked);
  if (cell !== undefined) await owner.getByTestId(cell.testId).click();
}

// The console runs the royale to its end: draws, taps on the owner's card, and each pause
// ended with "Start next round now"; the first pause and a moment of play are saved.
async function playRoyale(owner: Page, consolePage: Page): Promise<void> {
  const now = consolePage.getByTestId('host-next-round-now');
  const ready = consolePage.locator('[data-testid="host-draw-next"]:enabled');
  const done = consolePage.getByTestId('final-placement');
  let draws = 0;
  let paused = false;
  for (let i = 0; i < 200; i += 1) {
    await expect(ready.or(now).or(done).first()).toBeVisible({ timeout: 25_000 });
    if ((await done.count()) > 0) return;
    if ((await now.count()) > 0) {
      if (!paused) await savePause(owner, consolePage);
      paused = true;
      await now.click();
      await expect(now).toHaveCount(0, { timeout: 5_000 });
      continue;
    }
    await drawNext(consolePage);
    await tapCurrent(owner);
    draws += 1;
    if (draws === 6)
      await captureLook(owner, SHOTS_DIR, 'test-match-playing', owner.getByTestId('arena'));
  }
  throw new Error('the royale did not end');
}

async function savePause(owner: Page, consolePage: Page): Promise<void> {
  await expect(owner.getByTestId('current-ball')).toHaveText('Round over', { timeout: 10_000 });
  await captureLook(owner, SHOTS_DIR, 'test-match-pause', owner.getByTestId('arena'));
  await captureLook(
    consolePage,
    SHOTS_DIR,
    'test-match-console',
    consolePage.getByTestId('host-next-round-panel'),
  );
}

test('A: royale in 1 minute with host draws, 7 bots, playing along, to the result', async ({
  browser,
}) => {
  test.setTimeout(15 * 60_000);
  const context = await browser.newContext({ viewport: DESKTOP });
  const owner = await context.newPage();
  const code = await createTestMatch(owner, {
    gameType: 'royale',
    start: 'in1',
    bots: 7,
    drawMode: 'host',
  });
  try {
    await expect(owner.getByTestId('registration')).toContainText('starts automatically');
    await captureLook(owner, SHOTS_DIR, 'test-match-waiting', owner.getByTestId('waiting-room'));
    const [consolePage] = await Promise.all([
      context.waitForEvent('page'),
      owner.getByTestId('test-match-console').click(),
    ]);
    await expect(consolePage.getByTestId('host-console')).toBeVisible({ timeout: 20_000 });
    await captureLook(consolePage, SHOTS_DIR, 'test-match-console-lobby');
    // The automatic start at the set time, then the 10-second countdown on the owner's screen.
    await expect(owner.getByTestId('countdown')).toBeVisible({ timeout: 90_000 });
    await expect(owner.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    await playRoyale(owner, consolePage);
    await expect(owner.getByTestId('final-placement')).toBeVisible({ timeout: 10_000 });
    await captureLook(owner, SHOTS_DIR, 'test-match-result', owner.getByTestId('final-placement'));
  } finally {
    await stopMatch(owner, code);
  }
});

test('A: classic now with timed draws, playing along, to the result', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const owner = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  const code = await createTestMatch(owner, {
    gameType: 'classic',
    start: 'now',
    bots: 3,
    drawMode: 'auto',
  });
  try {
    await expect(owner.getByTestId('countdown')).toBeVisible({ timeout: 10_000 });
    await expect(owner.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
    const done = owner.getByTestId('final-placement');
    for (let i = 0; i < 600 && (await done.count()) === 0; i += 1) {
      await tapCurrent(owner);
      await owner.waitForTimeout(1_000);
    }
    await expect(done).toBeVisible();
  } finally {
    await stopMatch(owner, code);
  }
});

test('B: the seed simulation, spring-garden in classicSeasons then royale', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await page.setViewportSize(DESKTOP);
  await page.goto('/#/quicktest');
  await page.getByTestId('seed').fill('spring-garden', { timeout: 20_000 });
  await page.getByTestId('game-type').selectOption('classicSeasons');
  await page.getByTestId('simulation').getByTestId('start-draw-mode').selectOption('host');
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('simulation-summary')).toContainText('seed spring-garden');
  await expect(page.getByTestId('simulation').getByTestId('start-draw-mode')).toBeHidden();
  for (let i = 0; i < 5; i += 1) await page.getByTestId('draw-next').click();
  await captureLook(page, SHOTS_DIR, 'simulation-running', page.getByTestId('simulation'));
  await page.getByTestId('simulation-change').click();
  await expect(page.getByTestId('draw-next')).toHaveCount(0);
  await page.getByTestId('game-type').selectOption('royale');
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('simulation-summary')).toContainText('Battle royale');
  await page.getByRole('button', { name: 'Skip to end' }).click();
  await expect(page.getByTestId('final-placement')).toBeVisible({ timeout: 60_000 });
});

test('the console during maintenance: Start match disabled with the reason', async ({
  browser,
}) => {
  test.setTimeout(2 * 60_000);
  const host = await (await browser.newContext({ viewport: DESKTOP })).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Maintenance start',
    gameType: 'classic',
    drawMode: 'host',
    missed: 'noAutoMark',
    maxPlayers: 4,
  });
  try {
    mkdirSync(path.dirname(FLAG), { recursive: true });
    writeFileSync(FLAG, 'Database upgrade, back at 22:00\n');
    await expect.poll(async () => maintenanceOn(host)).toBe(true);
    await host.reload();
    await expect(host.getByTestId('start-match')).toBeDisabled({ timeout: 20_000 });
    await expect(host.getByTestId('start-maintenance')).toContainText('back at 22:00');
    await captureLook(
      host,
      SHOTS_DIR,
      'console-maintenance-start',
      host.getByTestId('start-match'),
    );
  } finally {
    rmSync(FLAG, { force: true });
    await stopMatch(host, code);
  }
});
