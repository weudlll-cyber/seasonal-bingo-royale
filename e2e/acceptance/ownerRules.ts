/**
 * @file   e2e/acceptance/ownerRules.ts
 * @module e2e/acceptance
 * @brief  The owner's rules D12–D15 asserted on screen during the real-game play-through.
 *
 * Responsibility: D12 — the create form and the live seconds field refuse an interval
 *                 below the longest tap time plus 1 s with a plain message; D13 — after a
 *                 host draw, Draw next counts down to its unlock; D14 — with "host starts
 *                 the next round", players read "Waiting for the host to start round N" and
 *                 no round starts on its own (checked over a wait longer than the default
 *                 pause) until the host presses "Start next round"; D15 — the cut screen's
 *                 button reads "Keep playing" for a survivor and "Watch" for an eliminated
 *                 player.
 * Depends on:     @playwright/test, ./livePlayer (types)
 * Used by:        the acceptance Playwright specs (test helper)
 * Spec:           docs/spec/01-game-design.md §5, §7.1, §13 (D12–D15)
 */
import { expect, type Page } from '@playwright/test';

import type { LivePlayer } from './livePlayer.js';

// D12 in the create form: missed numbers marked after 5 s, so 6 s is the shortest interval.
export async function checkShortestIntervalForm(host: Page): Promise<void> {
  await host.goto('/#/host/new');
  await host.getByTestId('missed-numbers').selectOption('autoMarkAfter');
  await host.getByTestId('missed-delay').fill('5');
  await host.getByTestId('start-draw-interval').fill('5');
  await expect(host.getByTestId('create-interval-problem')).toContainText('at least 6 seconds');
  await host.getByTestId('start-draw-interval').fill('6');
  await expect(host.getByTestId('create-interval-problem')).toHaveCount(0);
  // A fresh form for the match that follows (the form keeps its values while mounted).
  await host.reload();
}

// D12 in the console: a too-short interval is not sent; the message says why.
export async function checkShortestIntervalLive(host: Page): Promise<void> {
  const field = host.getByTestId('host-seconds');
  const before = await field.inputValue();
  await field.fill('1');
  await field.blur();
  await expect(host.getByText(/Draws need at least \d+(\.\d)? seconds between them/)).toBeVisible();
  await field.fill(before);
}

// D13: right after a host draw, Draw next counts down (not the round's last draw).
export async function checkDrawCountdown(host: Page): Promise<void> {
  await expect(host.getByTestId('host-draw-next')).toHaveText(/^Draw next in \d+ s$/, {
    timeout: 3_000,
  });
}

export const waitingForHost = async (host: Page): Promise<boolean> =>
  (await host.getByTestId('host-next-round').count()) > 0;

// D14: the players wait, nothing starts on its own, then the host starts the next round.
export async function startNextRoundByHost(
  host: Page,
  players: readonly LivePlayer[],
  beforeStart: () => Promise<void>,
): Promise<void> {
  const ticker = () => host.getByTestId('draw-ticker').locator(':scope > *').count();
  const drawnBefore = await ticker();
  for (const p of players) {
    await expect(p.page.getByTestId('waiting-for-host')).toHaveText(
      /^Waiting for the host to start round \d+$/,
      { timeout: 10_000 },
    );
  }
  // Longer than the default 15 s pause (D21): the round must not start without the host.
  await host.waitForTimeout(17_000);
  expect(await waitingForHost(host), 'still waiting for the host').toBe(true);
  expect(await ticker(), 'no new number while waiting').toBe(drawnBefore);
  await beforeStart();
  await host.getByTestId('host-next-round').click();
  await expect(host.getByTestId('host-next-round')).toHaveCount(0, { timeout: 10_000 });
  for (const p of players) await expect(p.page.getByTestId('waiting-for-host')).toHaveCount(0);
}

// D15: the cut screen's button by the player's outcome (own standings row). Both are read
// in one look at the page: the screen of an earlier cut goes away when the next cut leaves
// out a player already out (INTERLUDE-2: read apart, the button was gone in between).
export async function checkCutButton(p: LivePlayer): Promise<void> {
  const seen = await p.page.evaluate(() => {
    const button = document.querySelector('[data-testid="cut-screen"] button');
    const own = document.querySelector('[data-testid^="standing-"].is-own');
    if (button === null) return null;
    return {
      text: button.textContent.trim(),
      out: own?.getAttribute('data-eliminated') === 'true',
    };
  });
  if (seen === null) return;
  expect(seen.text, `${p.who}: cut button`).toBe(seen.out ? 'Watch' : 'Keep playing');
}
