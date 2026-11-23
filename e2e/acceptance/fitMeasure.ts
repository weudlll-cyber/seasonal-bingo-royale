/**
 * @file   e2e/acceptance/fitMeasure.ts
 * @module e2e/acceptance
 * @brief  The fit audit's shared steps: a window size and font, the round screens' key boxes, the findings count.
 *
 * Responsibility: `atSize` sets the window and the root font (16 px is the browser's own) and
 *                 waits two frames and a moment for observers; `ROUND_KEYS` names what a round
 *                 screen must show in one window (playerFit's rule: ball, drawn numbers, the
 *                 cards or Draw next); `keysOutOf` lists those boxes not wholly inside the
 *                 window; `findingsOf` counts a probe's findings (page scroll only on a round
 *                 screen). Used by the standalone audit and the website-mode sweep alike.
 * Depends on:     @playwright/test, ../layoutChecks, ./fitProbe (types)
 * Used by:        ./fitAudit.spec, ./websiteSweep
 * Spec:           docs/concepts/fit-audit.md; docs/spec/01-game-design.md §13
 */
import type { Page } from '@playwright/test';

import { layoutReport } from '../layoutChecks.js';
import type { Probe } from './fitProbe.js';

// What a round screen must show in one window (playerFit's rule): ball, numbers, the cards.
export const ROUND_KEYS: Readonly<Record<string, Record<string, string>>> = {
  console: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    'Draw next': '[data-testid="host-draw-next"]',
  },
  player: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    card: '.own-cards .live-card',
  },
  spectator: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    'watched cards': '[data-testid="watch-cards"]',
  },
};

export async function atSize(page: Page, w: number, h: number, font: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate((px) => {
    document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
    window.scrollTo(0, 0);
  }, font);
  // Two frames and a moment for observers (the standings' own-row strip) to follow.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(250);
}

export function findingsOf(p: Probe, round: boolean, keysOut: readonly string[]): number {
  return (
    p.smallText.length +
    p.smallCells.length +
    p.cut.length +
    p.outside.length +
    p.overlaps.length +
    (p.hScroll ? 1 : 0) +
    (round && p.pageScroll ? 1 : 0) +
    keysOut.length
  );
}

export async function keysOutOf(
  page: Page,
  keys: Record<string, string> | undefined,
): Promise<string[]> {
  if (keys === undefined) return [];
  const report = await layoutReport(page, keys);
  const { width, height } = report.view;
  return Object.entries(report.boxes)
    .filter(
      ([, b]) =>
        b === null || b.top < 0 || b.left < 0 || b.bottom > height + 0.5 || b.right > width + 0.5,
    )
    .map(([name]) => name);
}
