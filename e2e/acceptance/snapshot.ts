/**
 * @file   e2e/acceptance/snapshot.ts
 * @module e2e/acceptance
 * @brief  One read of everything the Quick Test shows, for the acceptance checks.
 *
 * Responsibility: collect in a single page.evaluate the header (round, draws), the draw
 *                 ticker, the owner's cells, status panel, bonus and feedback, the
 *                 standings, the cut screen, the match log and the final placement, so
 *                 every check after a draw works on one consistent picture of the page.
 * Depends on:     @playwright/test
 * Used by:        ./play.ts, ./checks.ts, ./acceptance.spec.ts
 * Spec:           docs/spec/01-game-design.md §5–§8, §13; docs/spec/12-testing-strategy.md §8
 */
import type { Page } from '@playwright/test';

export interface CellSnap {
  readonly testId: string;
  readonly value: number | null; // null for the free centre
  readonly marked: boolean;
  readonly season: string; // season of a season cell, else ''
}

export interface StandingSnap {
  readonly id: string;
  readonly points: number;
  readonly seasons: number;
  readonly eliminated: boolean;
}

export interface Snap {
  readonly at: number; // Date.now() in the test when the snapshot was taken
  readonly round: number;
  readonly draws: number;
  readonly roundOver: boolean; // the round has ended; its last number is still shown
  readonly ticker: readonly number[];
  readonly cells: readonly CellSnap[];
  readonly ownerPoints: number | null;
  readonly ownerRank: number | null;
  readonly seasonsCount: number | null; // null when no seasons panel is shown
  readonly shieldShown: boolean;
  // "Out in cut N" in the status panel once the owner is eliminated, else null.
  readonly ownerOut: string | null;
  readonly bonus: string | null;
  readonly feedback: string;
  readonly standings: readonly StandingSnap[];
  readonly cutShown: boolean;
  readonly logEntries: number;
  readonly finished: boolean;
  readonly finalOwnerPlace: number | null;
}

export async function snapshot(page: Page): Promise<Snap> {
  const raw = await page.evaluate(() => {
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
    const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v));
    const cells = () =>
      all('[data-testid^="owner-cell-"]').map((el) => ({
        testId: el.dataset['testid'] ?? '',
        value: num(el.dataset['value']),
        marked: el.dataset['marked'] === 'true',
        season: el.dataset['season'] ?? '',
      }));
    const standings = () =>
      all('[data-testid^="standing-"]').map((el) => ({
        id: (el.dataset['testid'] ?? '').replace('standing-', ''),
        points: Number(el.dataset['points']),
        seasons: Number(el.dataset['seasons']),
        eliminated: el.dataset['eliminated'] === 'true',
      }));
    const finalOwnerPlace = () => {
      const row = q('[data-testid^="final-row-"][data-account="owner-01"]');
      return num(row?.dataset['place']);
    };
    const header = () => {
      const banner = q('[data-testid="stage-banner"]');
      return {
        round: Number(banner?.dataset['round'] ?? -1),
        draws: Number(banner?.dataset['draws'] ?? -1),
        roundOver: banner?.dataset['roundOver'] === 'true',
      };
    };
    const owner = () => {
      const status = q('[data-testid^="owner-status-"]');
      return {
        ownerPoints: num(status?.dataset['points']),
        ownerRank: num(status?.dataset['rank']),
        seasonsCount: num(q('[data-testid="seasons-collected"]')?.dataset['count']),
        shieldShown: q('[data-testid="effect-shield"]') !== null,
        ownerOut: q('[data-testid="owner-out"]')?.textContent ?? null,
        bonus: q('[data-testid="owner-bonus"]')?.textContent ?? null,
        feedback: q('[data-testid="owner-feedback"]')?.textContent ?? '',
      };
    };
    return {
      ...header(),
      ...owner(),
      ticker: all('[data-testid="draw-ticker"] > *').map((el) => Number(el.dataset['item'])),
      cells: cells(),
      standings: standings(),
      cutShown: q('[data-testid="cut-screen"]') !== null,
      logEntries: all('[data-testid="match-log"] li').length,
      finished: q('[data-testid="final-placement"]') !== null,
      finalOwnerPlace: finalOwnerPlace(),
    };
  });
  return { ...raw, at: Date.now() };
}

// Changes exactly when a draw is shown (a window close changes the round state only).
export function tickKey(s: Snap): string {
  return `${String(s.round)}/${String(s.ticker.length)}`;
}
