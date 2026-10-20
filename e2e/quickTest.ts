/**
 * @file   e2e/quickTest.ts
 * @module e2e
 * @brief  Page helpers for the Quick Test specs: fill the start form, run, read results.
 *
 * Responsibility: one way to start a Quick Test from the browser with exact settings and
 *                 to skip to the end, so every spec drives the page the same way.
 * Depends on:     @playwright/test
 * Used by:        ./*.spec.ts
 * Spec:           docs/spec/15-implementation-plan.md WP-08
 */
import { expect, type Page } from '@playwright/test';

export const DEFAULT_PRIZES = ['rows-1', 'rows-2', 'fourCorners', 'oneDiagonal', 'fullCard'];

export interface RunSettings {
  readonly gameType: 'royale' | 'classicSeasons' | 'classic';
  readonly seed: string;
  readonly bots: number;
  readonly marking: 'auto' | 'manual';
  readonly prizes?: readonly string[];
  readonly skipToEnd?: boolean;
  // Draw control at start (D8); defaults: auto at the ruleset interval.
  readonly drawMode?: 'auto' | 'host';
  readonly intervalSec?: number;
}

const CATALOGUE = [
  'rows-1',
  'rows-2',
  'rows-3',
  'rows-4',
  'rows-5',
  'columns-1',
  'columns-2',
  'fourCorners',
  'oneDiagonal',
  'bothDiagonals',
  'fullCard',
];

export async function startRun(page: Page, settings: RunSettings): Promise<void> {
  await page.goto('/');
  await page.getByTestId('game-type').selectOption(settings.gameType);
  await page.getByTestId('seed').fill(settings.seed);
  await page.getByTestId('bot-count').fill(String(settings.bots));
  await page.getByTestId('owner-cards').fill('1');
  await page.getByTestId('marking-mode').selectOption(settings.marking);
  const prizes = new Set(settings.prizes ?? DEFAULT_PRIZES);
  for (const key of CATALOGUE) {
    await page.getByLabel(key, { exact: true }).setChecked(prizes.has(key));
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
