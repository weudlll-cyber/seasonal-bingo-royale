/**
 * @file   e2e/acceptance/polishScreens.spec.ts
 * @module e2e/acceptance
 * @brief  ARENA-POLISH played as the owner does, with its screenshots.
 *
 * Responsibility: royale with 10 bots and timed draws, the owner tapping every number in a
 *                 player tab beside the console tab: a two-digit number inside the ball, the own
 *                 place in view without scrolling (top 3 rows and the own row whole, the side
 *                 column without a scrollbar of its own) and, at the start of round 2, the
 *                 newest lines under a "Round 2" separator with round 1's dimmed below. Saves
 *                 polish-ball-*, polish-own-place-* and polish-round-lines-* at 1890×850,
 *                 1536×730 and on a phone in both themes. The match is aborted afterwards.
 *                 Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../realGame, ../layoutChecks, ./screenPlay
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, test } from '@playwright/test';

import { closeContexts, stopMatch } from '../realGame.js';
import { expectBallFits, expectOwnPlaceInView } from '../layoutChecks.js';
import { nextRound, openMatch, shoot, SIZES, tapCurrent, until, type Size } from './screenPlay.js';

const POLISH_SIZES = [
  { name: '1890', size: { width: 1890, height: 850 } },
  SIZES[0],
  SIZES[2],
] as const satisfies readonly Size[];

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test('arena polish: the ball, the own place, the lines by round', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const tabs = await openMatch(browser, 'royale', 'autoMarkAfter');
  const { code, console: host, player } = tabs;
  const tap = async () => {
    await tapCurrent(player);
    await nextRound(tabs);
  };
  try {
    await until(player, player.locator('.ball-number', { hasText: /^\d\d$/ }), tap);
    await expectBallFits(player, 'two-digit ball');
    await shoot(player, 'polish-ball', undefined, POLISH_SIZES);
    // An effect of the owner's, or 20 numbers: a full side column.
    const effect = player.getByTestId('effect-multiplier').or(player.getByTestId('effect-growth'));
    const later = player.locator('[data-testid="draw-ticker"] > *:nth-child(20)');
    await until(player, effect.or(later).first(), tap);
    for (const { name, size } of POLISH_SIZES.slice(0, 2)) {
      await player.setViewportSize(size);
      await expectOwnPlaceInView(player, `own place ${name}`);
    }
    await shoot(player, 'polish-own-place', undefined, POLISH_SIZES);
    // Round 2's first line above round 1's last ones.
    const separator = player.getByTestId('recent-events').getByTestId('round-separator');
    await until(player, separator, tap, 15);
    await expect(separator).toHaveText('Round 2');
    await shoot(player, 'polish-round-lines', player.getByTestId('recent-events'), POLISH_SIZES);
  } finally {
    await stopMatch(host, code);
  }
});
