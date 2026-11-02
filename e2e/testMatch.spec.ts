/**
 * @file   e2e/testMatch.spec.ts
 * @module e2e
 * @brief  The test page's "Play a test match": from signed out to the normal waiting room.
 *
 * Responsibility: the chooser leads to "Play a test match"; signed out it offers the dev host
 *                 sign-in instead of the form; signed in, "Create test match" (classic, in 1
 *                 minute, 3 bots, playing along) opens the host console of the new match in a
 *                 new tab and turns this tab into the match's normal player route: the waiting
 *                 room with the owner marked "(you)", the bots in, no host link and nothing of
 *                 the test page. The server holds a set time with the automatic start. The
 *                 match is aborted afterwards, also on failure. Chromium saves the chooser, the
 *                 form and the waiting room at both sizes in both themes.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §7.6 (D16), §13; docs/spec/15-implementation-plan.md WP-08
 */
import { expect, test } from '@playwright/test';

import { closeContexts, stopMatch } from './realGame.js';
import { captureLook, SHOTS_DIR } from './screens.js';

// The first page of a run is slow (the dev server compiles on demand).
const SETTLE_MS = 20_000;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('test page: a test match opens the console tab and this tab as a player', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const shots = info.project.name.startsWith('chromium');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/#/quicktest');
  await expect(page.getByRole('heading', { name: 'Test a match' })).toBeVisible({
    timeout: SETTLE_MS,
  });
  if (shots) await captureLook(page, SHOTS_DIR, 'test-chooser');
  await page.getByTestId('choose-play').click();
  await expect(page).toHaveURL(/#\/quicktest\/play$/);
  await page.getByTestId('test-match-sign-in-host').click({ timeout: SETTLE_MS });
  await expect(page.getByTestId('test-match-form')).toBeVisible({ timeout: SETTLE_MS });
  if (shots) await captureLook(page, SHOTS_DIR, 'test-play-form');

  await page.getByTestId('test-match-game-type').selectOption('classic');
  await page.getByTestId('test-match-start').selectOption('in1');
  await page.getByTestId('test-match-bots').fill('3');
  await expect(page.getByTestId('test-match-play-along')).toBeChecked();
  const consoleTab = context.waitForEvent('page');
  await page.getByTestId('test-match-create').click();

  await expect(page).toHaveURL(/#\/match\/[A-Z0-9]{4,}$/, { timeout: SETTLE_MS });
  const code = page.url().split('/').pop() ?? '';
  try {
    const host = await consoleTab;
    await expect(host).toHaveURL(new RegExp(`#/host/${code}$`));
    await expect(host.getByTestId('host-console')).toBeVisible({ timeout: SETTLE_MS });
    const waiting = page.getByTestId('waiting-room');
    await expect(waiting).toBeVisible({ timeout: SETTLE_MS });
    await expect(page.getByTestId('waiting-players').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('waiting-players')).toContainText('(you)');
    await expect(page.getByTestId('open-host-console')).toHaveCount(0);
    await expect(page.getByTestId('test-page')).toHaveCount(0);
    // "in 1 min", or the seconds once less than a minute is left (a slow browser).
    await expect(page.getByTestId('registration')).toContainText(/\(in (1 min|\d{1,2} s)\)/);
    const match = (await (await page.request.get(`/api/v1/matches/${code}`)).json()) as {
      status: string;
      settings: { startRule: { kind: string; auto?: boolean } };
    };
    expect(match.status).toBe('lobby');
    expect(match.settings.startRule).toMatchObject({ kind: 'at', auto: true });
    if (shots) await captureLook(page, SHOTS_DIR, 'test-match-waiting');
  } finally {
    await stopMatch(page, code);
  }
});
