/**
 * @file   e2e/acceptance/screenPlay.ts
 * @module e2e/acceptance
 * @brief  Playing a live match as the owner does, for the screenshot play-throughs.
 *
 * Responsibility: the host's royale or classic match with the host playing along beside the
 *                 console tab (10 bots, timed draws, the host starting each royale round,
 *                 D14), tapping the current number, playing until something shows, and saving
 *                 a screen at several sizes in both themes.
 * Depends on:     @playwright/test, ../realGame, ../screens, ./liveSnap
 * Used by:        ./clarityScreens.spec, ./polishScreens.spec
 * Spec:           docs/spec/01-game-design.md §13; docs/spec/12-testing-strategy.md §4
 */
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

import { fillAndStart, hostMatch, post, signIn } from '../realGame.js';
import { captureThemes, SHOTS_DIR } from '../screens.js';
import { liveSnap } from './liveSnap.js';

export interface Size {
  readonly name: string;
  readonly size: { readonly width: number; readonly height: number };
}

// The play-throughs' sizes: 1536×730, 1920×950 and a phone.
export const SIZES = [
  { name: '1536', size: { width: 1536, height: 730 } },
  { name: '1920', size: { width: 1920, height: 950 } },
  { name: 'phone', size: { width: 390, height: 844 } },
] as const satisfies readonly Size[];

// <name>-1536-light.jpg … <name>-phone-dark.jpg; back to 1536×730 afterwards.
export async function shoot(
  page: Page,
  name: string,
  show?: Locator,
  sizes: readonly Size[] = SIZES,
): Promise<void> {
  for (const { name: size, size: viewport } of sizes) {
    await page.setViewportSize(viewport);
    await captureThemes(page, SHOTS_DIR, `${name}-${size}`, show);
  }
  await page.setViewportSize(SIZES[0].size);
}

export interface Tabs {
  readonly code: string;
  readonly console: Page;
  readonly player: Page;
}

// The host's match with the host playing along (as a test match), 10 bots, timed draws:
// the console tab and the player tab.
export async function openMatch(
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
export async function nextRound(t: Tabs): Promise<void> {
  const button = t.console.getByTestId('host-next-round');
  if ((await button.count()) === 0) return;
  const progress = await t.player.getByTestId('arena-progress').innerText();
  if (/\(final\) next/.test(progress)) return;
  await button.click();
}

export async function tapCurrent(owner: Page): Promise<void> {
  const s = await liveSnap(owner);
  const cell = s.cells.find((x) => x.value === s.item && !x.marked);
  if (cell !== undefined) await owner.getByTestId(cell.testId).click();
}

// Plays (or watches) until `done` shows, running `step` about every 0.7 s.
export async function until(
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
