/**
 * @file   e2e/acceptance/leagueScreens.spec.ts
 * @module e2e/acceptance
 * @brief  The leaderboard filled by the development demo league, with its screenshots.
 *
 * Responsibility: removes any demo league, starts one (ten verified demo accounts, three
 *                 counting royales played by the server) and waits for its matches to finish;
 *                 then saves the season board with 10 rows (league-board-filled-*), the
 *                 all-time board with two players sharing a rank in view (league-tie-*, D28)
 *                 and demo-01's profile with 3 matches (league-profile-*), at desktop and phone
 *                 size in both themes. The demo accounts are removed afterwards; finished
 *                 matches stay. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../screens
 * Spec:           docs/spec/01-game-design.md §10 (D28, D29)
 */
import { expect, test, type Page } from '@playwright/test';

import { captureLook, SHOTS_DIR } from '../screens.js';

const DEMO = '/api/v1/dev/demo-league';

// The rank of every board row, top to bottom.
const ranksOn = (page: Page) =>
  page
    .locator('[data-testid^="league-row-"]')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-rank')));

test('league screens: a filled board, a tie, a profile', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await page.request.delete(DEMO);
  const started = await page.request.post(DEMO);
  expect(started.status()).toBe(202);
  const { matches } = (await started.json()) as { matches: string[] };
  try {
    for (const code of matches) {
      await expect
        .poll(
          async () =>
            (
              (await (await page.request.get(`/api/v1/matches/${code}`)).json()) as {
                status: string;
              }
            ).status,
          { timeout: 10 * 60_000, intervals: [5_000] },
        )
        .toBe('finished');
    }
    await page.goto('/#/leaderboard');
    const rows = page.locator('[data-testid^="league-row-"]');
    await expect(rows).toHaveCount(10);
    await captureLook(page, SHOTS_DIR, 'league-board-filled');
    await page.getByTestId('leaderboard-period').selectOption({ label: 'All time' });
    await expect(rows).toHaveCount(10);
    const ranks = await ranksOn(page);
    const tied = ranks.findIndex((r, i) => i > 0 && r === ranks[i - 1]);
    expect(tied, `two players share a rank (ranks ${ranks.join(', ')})`).toBeGreaterThan(0);
    await captureLook(page, SHOTS_DIR, 'league-tie', rows.nth(tied));
    await page.goto('/#/players/demo-01');
    await expect(page.getByTestId('profile-matches')).toHaveText('3');
    await captureLook(page, SHOTS_DIR, 'league-profile');
  } finally {
    expect((await page.request.delete(DEMO)).status()).toBe(200);
  }
});
