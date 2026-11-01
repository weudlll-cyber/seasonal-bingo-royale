/**
 * @file   e2e/acceptance/clarityScreens.spec.ts
 * @module e2e/acceptance
 * @brief  PLAYER-CLARITY played as the owner does, with its screenshots (D23, D24).
 *
 * Responsibility: royale with 10 bots and timed draws, the owner playing along in a player tab
 *                 beside the console tab: (A) tapping every number, to the result: the player
 *                 screen, the console, the specials, patterns this round, a shield save, the final's
 *                 notice and grouped standings; (B) never tapping (missed numbers left open), so the
 *                 owner is out in cut 1: the top 4 still in, "1 to go", following one player and
 *                 the line when that player goes out (the short fast rules); (C) a classic match.
 *                 The host starts each royale round from the console (D14). (D) CLARITY-FIXES:
 *                 the seasons line, the host link in a new tab (D25), the owner out before the
 *                 final, standings rows apart, the full card's owner 1st on the placement
 *                 (fixes-* at 1536×730 and on a phone). Saves clarity-*, watch-*
 *                 at 1536×730, 1920×950 and on a phone in both themes. Every match is aborted if it
 *                 has not ended. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../realGame, ../layoutChecks, ../screens, ./liveSnap
 * Spec:           docs/spec/01-game-design.md §7.2, §7.5, §8.2, §13 (D23, D24)
 */
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

import { closeContexts, fillAndStart, hostMatch, post, signIn, stopMatch } from '../realGame.js';
import { expectRowsApart } from '../layoutChecks.js';
import { captureThemes, SHOTS_DIR } from '../screens.js';
import { liveSnap } from './liveSnap.js';

const SIZES = [
  { name: '1536', size: { width: 1536, height: 730 } },
  { name: '1920', size: { width: 1920, height: 950 } },
  { name: 'phone', size: { width: 390, height: 844 } },
] as const;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// <name>-1536-light.jpg … <name>-phone-dark.jpg; back to 1536×730 afterwards.
async function shoot(
  page: Page,
  name: string,
  show?: Locator,
  sizes: readonly (typeof SIZES)[number][] = SIZES,
): Promise<void> {
  for (const { name: size, size: viewport } of sizes) {
    await page.setViewportSize(viewport);
    await captureThemes(page, SHOTS_DIR, `${name}-${size}`, show);
  }
  await page.setViewportSize(SIZES[0].size);
}

interface Tabs {
  readonly code: string;
  readonly console: Page;
  readonly player: Page;
}

// The host's match with the host playing along (as a test match), 10 bots, timed draws:
// the console tab and the player tab.
async function openMatch(
  browser: Browser,
  gameType: 'royale' | 'classic',
  missed: 'autoMarkAfter' | 'noAutoMark',
  // The server's short royale (development only); the normal rounds bring patterns.
  fast = false,
): Promise<Tabs> {
  const host = await (await browser.newContext({ viewport: SIZES[0].size })).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Test match',
    gameType,
    drawMode: 'auto',
    intervalSec: 4,
    missed,
    maxPlayers: 11,
    // Royale: the host starts each next round (D14), see nextRound.
    ...(gameType === 'royale' ? { pause: 'host' as const, fast } : {}),
  });
  expect((await post(host, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
  const player = await host.context().newPage();
  await player.goto(`/#/match/${code}`);
  await fillAndStart(host, 11);
  await expect(player.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
  return { code, console: host, player };
}

// The host starts each next round (D14) from the console tab, but not the final until its
// notice has been saved (the notice shows in that pause and the final's first draws).
async function nextRound(t: Tabs): Promise<void> {
  const button = t.console.getByTestId('host-next-round');
  if ((await button.count()) === 0) return;
  const progress = await t.player.getByTestId('arena-progress').innerText();
  if (/\(final\) next/.test(progress)) return;
  await button.click();
}

async function tapCurrent(owner: Page): Promise<void> {
  const s = await liveSnap(owner);
  const cell = s.cells.find((x) => x.value === s.item && !x.marked);
  if (cell !== undefined) await owner.getByTestId(cell.testId).click();
}

// Plays (or watches) until `done` shows, running `step` about every 0.7 s.
async function until(
  page: Page,
  done: Locator,
  step: () => Promise<void>,
  minutes = 10,
): Promise<void> {
  const end = Date.now() + minutes * 60_000;
  while ((await done.count()) === 0) {
    if (Date.now() > end) throw new Error(`not seen in ${String(minutes)} min: ${String(done)}`);
    await step();
    await page.waitForTimeout(700);
  }
}

test('A: royale, the owner taps every number, to the result', async ({ browser }) => {
  test.setTimeout(45 * 60_000);
  const tabs = await openMatch(browser, 'royale', 'autoMarkAfter');
  const { code, console: host, player } = tabs;
  const tap = async () => {
    await tapCurrent(player);
    await nextRound(tabs);
  };
  try {
    await until(player, player.locator('[data-testid="draw-ticker"] > *:nth-child(5)'), tap);
    await shoot(player, 'clarity-player');
    await shoot(host, 'clarity-console');
    const effect = player.locator(
      '[data-testid^="effect-multiplier"], [data-testid="effect-growth"]',
    );
    await until(player, effect, tap);
    await shoot(player, 'clarity-specials', player.getByTestId(/^owner-status-/));
    await until(player, player.getByText(/^first: /), tap);
    await shoot(player, 'clarity-patterns', player.getByTestId('patterns-panel'));
    // The owner's own save (cut screen and status); a save of other players is in the lines.
    const saved = player.getByText(/shield saved you/i);
    await until(player, saved.or(player.getByTestId('final-notice')).first(), tap, 15);
    if ((await saved.count()) > 0) await shoot(player, 'clarity-shield-saved', saved.first());
    await finalScreens(player, host, tap);
  } finally {
    await stopMatch(host, code);
  }
});

// The final's notice on the player screen and the console, then the grouped standings
// during the final and the placement at the end.
async function finalScreens(player: Page, host: Page, step: () => Promise<void>): Promise<void> {
  await finalStart(player, host, step);
  await finalEnd(player, step);
}

async function finalStart(player: Page, host: Page, step: () => Promise<void>): Promise<void> {
  await until(player, player.getByTestId('final-notice'), step, 15);
  await shoot(player, 'clarity-final-start');
  await shoot(host, 'clarity-final-start-console');
  // Now the host starts the final.
  await host.getByTestId('host-next-round').click();
}

async function finalEnd(player: Page, step: () => Promise<void>): Promise<void> {
  await until(player, player.locator('[data-testid="draw-ticker"] > *:nth-child(4)'), step);
  await expect(player.getByTestId('standings')).toContainText('In the final');
  await shoot(player, 'clarity-final-standings', player.getByTestId('standings-panel'));
  await until(player, player.getByTestId('final-placement'), step, 15);
}

test('B: royale, the owner never taps, is out in cut 1 and watches', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  const tabs = await openMatch(browser, 'royale', 'noAutoMark', true);
  const { code, console: host, player } = tabs;
  const idle = () => nextRound(tabs);
  try {
    await until(player, player.getByTestId('watch-cards'), idle, 15);
    // "Watch" on the cut screen (D15), then a few draws with marks on the watched cards.
    await player.getByRole('button', { name: 'Watch' }).click();
    await until(player, player.locator('[data-testid="draw-ticker"] > *:nth-child(3)'), idle);
    await expect(player.locator('[data-testid^="watch-card-"]')).toHaveCount(4);
    await shoot(player, 'watch-top4');
    // Follow the lowest player still in: the likeliest to go out in the next cut.
    const names = player.locator('.rank-name-btn');
    await names.nth((await names.count()) - 1).click();
    await expect(player.getByText('Back to the top 4')).toBeVisible();
    await shoot(player, 'watch-follow');
    const out = player.getByTestId('watch-followed-out');
    await until(player, out.or(player.getByTestId('final-notice')).first(), idle, 15);
    if ((await out.count()) > 0) await shoot(player, 'watch-followed-out', out);
    await finalStart(player, host, idle);
    const back = player.getByRole('button', { name: 'Back to the top 4' });
    if ((await back.count()) > 0) await back.click();
    await until(player, player.locator('.watch-togo'), idle);
    await shoot(player, 'watch-one-to-go', player.locator('.watch-togo').first());
    await finalEnd(player, idle);
  } finally {
    await stopMatch(host, code);
  }
});

test('C: classic, the owner taps every number, to the result', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const { code, console: host, player } = await openMatch(browser, 'classic', 'autoMarkAfter');
  const tap = () => tapCurrent(player);
  try {
    await until(player, player.locator('[data-testid="draw-ticker"] > *:nth-child(8)'), tap);
    await shoot(player, 'clarity-classic');
    await shoot(host, 'clarity-classic-console');
    await until(player, player.getByTestId('final-placement'), tap, 15);
  } finally {
    await stopMatch(host, code);
  }
});

const FIXES_SIZES = [SIZES[0], SIZES[2]];

test('D: the fixes: seasons line, host link tab, rows apart, the full card 1st', async ({
  browser,
}) => {
  test.setTimeout(45 * 60_000);
  const tabs = await openMatch(browser, 'royale', 'noAutoMark');
  const { code, console: host, player } = tabs;
  const seasons = player.getByTestId('seasons-collected');
  // Tap until a season is collected, then stop: few points, out before the final.
  await until(player, seasons.and(player.locator(':not([data-count="0"])')), () =>
    tapCurrent(player),
  );
  await expect(seasons).not.toContainText('–');
  await shoot(player, 'fixes-seasons-line', seasons, FIXES_SIZES);
  const [consoleTab] = await Promise.all([
    player.context().waitForEvent('page'),
    player.getByTestId('open-host-console').click(),
  ]);
  await expect(consoleTab.getByTestId('host-console')).toBeVisible();
  await expect(player.getByTestId('arena')).toBeVisible();
  await consoleTab.close();
  const idle = async () => {
    await nextRound(tabs);
    await expectRowsApart(player, 'player screen');
  };
  try {
    await until(player, player.getByTestId('final-notice'), idle, 30);
    await expect(player.getByTestId('owner-out')).toBeVisible();
    await host.getByTestId('host-next-round').click();
    await until(player, player.locator('[data-testid="draw-ticker"] > *:nth-child(4)'), idle);
    await shoot(
      player,
      'fixes-final-standings',
      player.getByTestId('standings-panel'),
      FIXES_SIZES,
    );
    await until(player, player.getByTestId('final-placement'), idle, 15);
    // The round-end line names who filled the whole card; that player is 1st.
    await player.getByText(/^Whole match log/).click();
    const line = await player
      .getByTestId('match-log')
      .getByText(/filled the whole card$/)
      .innerText();
    const winner = line.replace(/^Round \d+ over — /, '').replace(/ filled the whole card$/, '');
    await expect(player.getByTestId('final-row-1')).toContainText(winner);
    await shoot(
      player,
      'fixes-final-placement',
      player.getByTestId('final-placement'),
      FIXES_SIZES,
    );
  } finally {
    await stopMatch(host, code);
  }
});
