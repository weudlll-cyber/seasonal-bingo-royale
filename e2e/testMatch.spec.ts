/**
 * @file   e2e/testMatch.spec.ts
 * @module e2e
 * @brief  The test page's real test match: from signed out to the waiting room with bots.
 *
 * Responsibility: on "Test a match" a signed-out owner sees the dev host sign-in instead of
 *                 the form; signed in, "Create test match" (classic, in 1 minute, 3 bots,
 *                 playing along) opens the waiting room right there with the owner marked
 *                 "(you)", the bots in, the code, "Open host console" in a new tab and the
 *                 numbered steps; the server holds a set time with the automatic start. The
 *                 match is aborted afterwards, also on failure. Chromium saves the page and
 *                 the waiting room at both sizes in both themes.
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

test('test page: a real test match opens its waiting room with the bots in', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const shots = info.project.name.startsWith('chromium');
  const page = await (await browser.newContext()).newPage();
  await page.goto('/#/quicktest');
  await expect(page.getByRole('heading', { name: 'Test a match' })).toBeVisible({
    timeout: SETTLE_MS,
  });
  await page.getByTestId('test-match-sign-in-host').click({ timeout: SETTLE_MS });
  await expect(page.getByTestId('test-match-form')).toBeVisible({ timeout: SETTLE_MS });
  if (shots) await captureLook(page, SHOTS_DIR, 'test-page');

  await page.getByTestId('test-match-game-type').selectOption('classic');
  await page.getByTestId('test-match-start').selectOption('in1');
  await page.getByTestId('test-match-bots').fill('3');
  await expect(page.getByTestId('test-match-play-along')).toBeChecked();
  await page.getByTestId('test-match-create').click();

  const ready = page.getByTestId('test-match-ready');
  await expect(ready).toBeVisible({ timeout: SETTLE_MS });
  const code = (await page.getByTestId('test-match-code').textContent()) ?? '';
  try {
    expect(code).toMatch(/^[A-Z0-9]{4,}$/);
    await expect(page.getByTestId('test-match-console')).toHaveAttribute('href', `#/host/${code}`);
    await expect(page.getByTestId('test-match-console')).toHaveAttribute('target', '_blank');
    await expect(page.getByTestId('test-match-steps')).toContainText(`match ${code}`);
    const waiting = page.getByTestId('waiting-room');
    await expect(waiting).toBeVisible({ timeout: SETTLE_MS });
    await expect(page.getByTestId('waiting-players').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('waiting-players')).toContainText('(you)');
    const match = (await (await page.request.get(`/api/v1/matches/${code}`)).json()) as {
      status: string;
      settings: { startRule: { kind: string; auto?: boolean } };
    };
    expect(match.status).toBe('lobby');
    expect(match.settings.startRule).toMatchObject({ kind: 'at', auto: true });
    if (shots) await captureLook(page, SHOTS_DIR, 'test-match-waiting', waiting);
  } finally {
    await stopMatch(page, code);
  }
});
