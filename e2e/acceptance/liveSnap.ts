/**
 * @file   e2e/acceptance/liveSnap.ts
 * @module e2e/acceptance
 * @brief  One read of a live match screen (player or host) and the per-screen checks.
 *
 * Responsibility: read the current number, the round's numbers, the player's own cells,
 *                 status panel, standings, cut screen and final rows in a single
 *                 page.evaluate, and check on every player screen: the points above the card
 *                 equal the player's standings row, no marked cell holds an undrawn number.
 * Depends on:     @playwright/test
 * Used by:        ./livePlayer, ./recap
 * Spec:           docs/spec/12-testing-strategy.md §4, §8; docs/spec/01-game-design.md §5–§7
 */
import { expect, type Page } from '@playwright/test';

export interface LiveCell {
  readonly testId: string;
  readonly value: number | null;
  readonly marked: boolean;
}

export interface LiveSnap {
  readonly at: number;
  readonly item: number | null;
  readonly ticker: readonly number[];
  readonly cells: readonly LiveCell[];
  readonly me: string | null;
  // The standings row highlighted as the viewer's own.
  readonly ownRow: string | null;
  // The page is wider than the window (sideways scrolling, e.g. on the phone).
  readonly overflowX: boolean;
  readonly points: number | null;
  readonly rank: number | null;
  readonly standings: readonly { readonly id: string; readonly points: number }[];
  readonly cutShown: boolean;
  readonly finished: boolean;
}

export async function liveSnap(page: Page): Promise<LiveSnap> {
  const raw = await page.evaluate(() => {
    const q = (sel: string) => document.querySelector<HTMLElement>(sel);
    const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
    const num = (v: string | undefined | null) =>
      v === undefined || v === null || v === '' ? null : Number(v);
    const status = q('[data-testid^="owner-status-"]');
    return {
      item: num(q('[data-testid="current-ball"]')?.dataset['item']),
      ticker: all('[data-testid="draw-ticker"] > *').map((el) => Number(el.dataset['item'])),
      cells: all('[data-testid^="owner-cell-"]').map((el) => ({
        testId: el.dataset['testid'] ?? '',
        value: num(el.dataset['value']),
        marked: el.dataset['marked'] === 'true',
      })),
      // The account chip reads "Signed in as <name> (player)".
      me:
        /^Signed in as (.+) \((?:host|player)\)$/.exec(
          q('[data-testid="signed-in-as"]')?.textContent ?? '',
        )?.[1] ?? null,
      ownRow:
        (q('[data-testid^="standing-"].is-own')?.dataset['testid'] ?? '').replace(
          'standing-',
          '',
        ) || null,
      points: num(status?.dataset['points']),
      rank: num(status?.dataset['rank']),
      standings: all('[data-testid^="standing-"]').map((el) => ({
        id: (el.dataset['testid'] ?? '').replace('standing-', ''),
        points: Number(el.dataset['points']),
      })),
      cutShown: q('[data-testid="cut-screen"]') !== null,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      finished: q('[data-testid="final-placement"]') !== null,
    };
  });
  return { ...raw, at: Date.now() };
}

// Every player screen: points above the card = own standings row; marks only on drawn numbers.
export function checkPlayer(s: LiveSnap, who: string): void {
  // At the end the final placement replaces the standings (checked against the server).
  if (s.points !== null && !s.finished) {
    expect(s.ownRow, `${who}: own row highlighted`).toBe(s.me);
    expect(s.overflowX, `${who}: nothing wider than the window`).toBe(false);
    const row = s.standings.find((r) => r.id === s.me);
    expect(row, `${who}: own row in the standings`).toBeDefined();
    expect(s.points, `${who}: points above the card = standings`).toBe(row?.points);
  }
  for (const c of s.cells) {
    if (c.marked && c.value !== null) {
      expect(s.ticker, `${who}: marked ${String(c.value)} was drawn`).toContain(c.value);
    }
  }
}
