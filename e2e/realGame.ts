/**
 * @file   e2e/realGame.ts
 * @module e2e
 * @brief  Page helpers for the real game: quick sign-in, host a match, join, read the arena.
 *
 * Responsibility: one way for every real-game spec to sign in with the development quick
 *                 sign-in, create a match from the host's form, join from the lobby, start
 *                 it with bots, press Draw next once its window allows, and read the current
 *                 number and the standings from a screen.
 * Depends on:     @playwright/test
 * Used by:        ./realGame.spec.ts, ./acceptance/realGame.spec.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-12, WP-13; docs/spec/12-testing-strategy.md §4
 */
import { expect, type Page } from '@playwright/test';

export type Who = 'host' | 'player-1' | 'player-2' | 'player-3';

export async function signIn(page: Page, who: Who): Promise<void> {
  await page.goto('/#/');
  await page.getByTestId(`dev-sign-in-${who}`).click();
  await expect(page.getByTestId('signed-in-as')).toHaveText(
    who === 'host' ? 'dev-host' : `dev-${who}`,
  );
}

export interface NewMatch {
  readonly title: string;
  readonly gameType: 'royale' | 'classicSeasons' | 'classic';
  readonly prizes?: readonly string[];
  readonly drawMode: 'auto' | 'host';
  readonly intervalSec?: number;
  readonly missed: 'autoMarkAfter' | 'noAutoMark';
  readonly maxPlayers?: number;
}

// Creates the match from the host's form and returns its code (the console shows it).
export async function hostMatch(page: Page, m: NewMatch): Promise<string> {
  await page.goto('/#/host/new');
  await page.getByTestId('create-title').fill(m.title);
  await page.getByTestId('create-game-type').selectOption(m.gameType);
  if (m.prizes !== undefined) {
    for (const box of await page.locator('[data-testid^="prize-"]').all()) await box.uncheck();
    for (const p of m.prizes) await page.getByTestId(`prize-${p}`).check();
  }
  await page.getByTestId('start-draw-mode').selectOption(m.drawMode);
  if (m.intervalSec !== undefined)
    await page.getByTestId('start-draw-interval').fill(String(m.intervalSec));
  await page.getByTestId('missed-numbers').selectOption(m.missed);
  await page.getByTestId('create-max').fill(String(m.maxPlayers ?? 20));
  await page.getByTestId('create-submit').click();
  await expect(page.getByTestId('host-console')).toBeVisible();
  return (await page.getByTestId('host-code').innerText()).trim();
}

export async function joinFromLobby(page: Page, code: string): Promise<void> {
  await page.goto('/#/');
  await page.getByTestId(`join-${code}`).click();
  await expect(page.getByTestId('waiting-room')).toBeVisible();
}

export async function fillAndStart(host: Page, upTo: number): Promise<void> {
  // The console has loaded the lobby (the bots field only exists there).
  await expect(host.getByTestId('bots-up-to')).toBeVisible();
  await host.getByTestId('bots-up-to').fill(String(upTo));
  await host.getByTestId('fill-bots').click();
  await expect(host.getByTestId('host-players').locator('li')).toHaveCount(upTo);
  await host.getByTestId('start-match').click();
  await expect(host.getByTestId('host-status')).toHaveText('running', { timeout: 20_000 });
}

// The current number on a screen (data-item of the ball), or null before the first draw.
export async function currentItem(page: Page): Promise<number | null> {
  const value = await page.getByTestId('current-ball').getAttribute('data-item');
  return value === null ? null : Number(value);
}

// Host draws: waits until Draw next is enabled (the previous window closed), presses, and
// waits until the new number is on the host's screen.
export async function drawNext(host: Page): Promise<void> {
  const button = host.getByTestId('host-draw-next');
  await expect(button).toBeEnabled({ timeout: 15_000 });
  const before = await host.getByTestId('draw-ticker').locator(':scope > *').count();
  await button.click();
  await expect
    .poll(async () => host.getByTestId('draw-ticker').locator(':scope > *').count(), {
      timeout: 10_000,
    })
    .not.toBe(before);
}
