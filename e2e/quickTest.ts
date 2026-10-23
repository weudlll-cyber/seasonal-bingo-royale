/**
 * @file   e2e/quickTest.ts
 * @module e2e
 * @brief  Page helpers for the Quick Test specs: fill the start form, run, read results.
 *
 * Responsibility: one way to start a Quick Test from the browser with exact settings and
 *                 to skip to the end, so every spec drives the page the same way.
 * Depends on:     @playwright/test, @sbr/contracts (prize list)
 * Used by:        ./*.spec.ts, ./acceptance/acceptance.spec
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { expect, type Page } from '@playwright/test';
import { BUILTIN_PRIZE_KEYS, DEFAULT_PRIZE_SELECTION } from '@sbr/contracts';

export interface RunSettings {
  readonly gameType: 'royale' | 'classicSeasons' | 'classic';
  readonly seed: string;
  readonly bots: number;
  // 'manual' = "Marking: I tap the numbers", 'auto' = "Marking: mark for me".
  readonly marking: 'auto' | 'manual';
  // When tapping (01 §6): missed numbers marked after missedDelaySec (default 3) or left open.
  readonly missed?: 'autoMarkAfter' | 'noAutoMark';
  readonly missedDelaySec?: number;
  readonly prizes?: readonly string[];
  readonly skipToEnd?: boolean;
  // Draw control at start (D8): 'auto' = timed draws (default, ruleset interval),
  // 'host' = host presses Draw next.
  readonly drawMode?: 'auto' | 'host';
  readonly intervalSec?: number;
}

export async function startRun(page: Page, settings: RunSettings): Promise<void> {
  // The Quick Test lives at #/quicktest in the app shell (development builds).
  await page.goto('/#/quicktest');
  await page.getByTestId('game-type').selectOption(settings.gameType);
  await page.getByTestId('seed').fill(settings.seed);
  await page.getByTestId('bot-count').fill(String(settings.bots));
  await page.getByTestId('owner-cards').fill('1');
  await page.getByTestId('marking-mode').selectOption(settings.marking);
  if (settings.marking === 'manual') {
    await page.getByTestId('missed-numbers').selectOption(settings.missed ?? 'autoMarkAfter');
    if (settings.missedDelaySec !== undefined) {
      await page.getByTestId('missed-delay').fill(String(settings.missedDelaySec));
    }
  }
  const prizes = new Set(settings.prizes ?? DEFAULT_PRIZE_SELECTION);
  for (const key of BUILTIN_PRIZE_KEYS) {
    await page.getByTestId(`start-prize-${key}`).setChecked(prizes.has(key));
  }
  await page.getByTestId('start-draw-mode').selectOption(settings.drawMode ?? 'auto');
  if (settings.intervalSec !== undefined) {
    await page.getByTestId('start-draw-interval').fill(String(settings.intervalSec));
  }
  await page.getByTestId('start-run').click();
  await expect(page.getByTestId('stage-banner')).toBeVisible();
  // A new run resets skip, so skip is pressed once the match is on screen.
  if (settings.skipToEnd === true) await page.getByRole('button', { name: 'skip to end' }).click();
}

// Runs a match to the end and returns the final placement as text.
export async function finalPlacement(page: Page, settings: RunSettings): Promise<string> {
  await startRun(page, { ...settings, skipToEnd: true });
  const placement = page.getByTestId('final-placement');
  await expect(placement).toBeVisible({ timeout: 60_000 });
  return placement.innerText();
}
