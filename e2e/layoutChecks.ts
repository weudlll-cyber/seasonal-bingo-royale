/**
 * @file   e2e/layoutChecks.ts
 * @module e2e
 * @brief  Layout checks the live-screen specs share.
 *
 * Responsibility: no two standings rows cover each other where they are seen (each row
 *                 clipped to the list it scrolls in), so the viewer's own row never sits over
 *                 another row.
 * Depends on:     @playwright/test
 * Used by:        ./playerFit.spec, ./acceptance/clarityScreens.spec
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, type Page } from '@playwright/test';

// No two standings rows cover each other where they are seen (each row clipped to the
// list it scrolls in): the viewer's own row never sits over another row.
export async function expectRowsApart(page: Page, what: string): Promise<void> {
  const overlaps = await page.evaluate(() => {
    const seen = [...document.querySelectorAll('[data-testid="standings-panel"] .rank-row')]
      .map((row) => {
        const r = row.getBoundingClientRect();
        const box = (row.closest('ol') ?? row).getBoundingClientRect();
        const top = Math.max(r.top, box.top);
        const bottom = Math.min(r.bottom, box.bottom);
        return { name: row.getAttribute('data-testid') ?? '', top, bottom };
      })
      .filter((r) => r.bottom - r.top > 1);
    return seen.flatMap((a, i) =>
      seen
        .slice(i + 1)
        .filter((b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
        .map((b) => `${a.name} × ${b.name}`),
    );
  });
  expect(overlaps, `${what}: standings rows that cover each other`).toEqual([]);
}
