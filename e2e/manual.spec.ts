/**
 * @file   e2e/manual.spec.ts
 * @module e2e
 * @brief  Manual marking in the browser: drawn marks, undrawn refused, missed auto-marked.
 *
 * Responsibility: play a classic round in `manual` mode and check that one tick shows
 *                 exactly one new number, then the three rules of 01 §6 on the owner's
 *                 card: a tapped drawn number is marked with a speed bonus, a tapped
 *                 undrawn number is refused, and a drawn number the owner leaves alone is
 *                 auto-marked without bonus when its speed window closes.
 * Depends on:     @playwright/test, ./quickTest
 * Spec:           docs/spec/01-game-design.md §6, docs/spec/15-implementation-plan.md WP-08
 */
import { expect, test, type Page } from '@playwright/test';

import { startRun } from './quickTest.js';

const SPEED_WINDOW_MS = 3_000; // ruleset default, marking.speedWindowMs

interface CellInfo {
  readonly testId: string;
  readonly value: number;
  readonly marked: boolean;
}

// Owner cells with a number, and the numbers drawn so far in this round.
async function snapshot(page: Page): Promise<{ cells: CellInfo[]; drawn: number[] }> {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll<HTMLElement>('[data-testid^="owner-cell-"]')]
      .filter((el) => el.dataset['value'] !== '')
      .map((el) => ({
        testId: el.dataset['testid'] ?? '',
        value: Number(el.dataset['value']),
        marked: el.dataset['marked'] === 'true',
      }));
    const ticker = document.querySelector('[data-testid="draw-ticker"]');
    const drawn = [...(ticker?.children ?? [])].map((el) => Number(el.textContent));
    return { cells, drawn };
  });
}

// Waits until one of the owner's unmarked numbers has just been drawn and returns it.
async function nextDrawnOwnerCell(page: Page, skip: ReadonlySet<string>): Promise<CellInfo> {
  let found: CellInfo | undefined;
  await expect
    .poll(
      async () => {
        const { cells, drawn } = await snapshot(page);
        const latest = drawn.at(-1);
        found = cells.find((c) => c.value === latest && !c.marked && !skip.has(c.testId));
        return found !== undefined;
      },
      { timeout: 60_000, intervals: [100] },
    )
    .toBe(true);
  if (found === undefined) throw new Error('no drawn owner cell');
  return found;
}

// Taps a freshly drawn owner number. On a slow, busy machine the 3 s window can close
// before the click lands (then the cell is correctly auto-marked); try the next one.
async function tapInsideWindow(page: Page): Promise<Set<string>> {
  const tried = new Set<string>();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cell = await nextDrawnOwnerCell(page, tried);
    tried.add(cell.testId);
    await page.getByTestId(cell.testId).click();
    await expect(page.getByTestId(cell.testId)).toHaveAttribute('data-marked', 'true');
    const text = await page.getByTestId('owner-feedback').innerText();
    if (text.startsWith('Marked · +')) return tried;
  }
  throw new Error('no tap landed inside the speed window in five attempts');
}

test('manual mode: drawn marks, undrawn is refused, a missed number is auto-marked', async ({
  page,
}) => {
  // Realtime pace: one draw every 5 s (ruleset drawIntervalMs), so the round takes time.
  test.setTimeout(180_000);
  await startRun(page, { gameType: 'classic', seed: 'e2e-manual', bots: 3, marking: 'manual' });
  const feedback = page.getByTestId('owner-feedback');

  await expect(page.getByTestId('draw-newest')).toBeVisible({ timeout: 30_000 });
  // Between two consecutive ticks exactly one new number appears in the ticker.
  const shown = (): Promise<number> =>
    page.getByTestId('draw-ticker').locator(':scope > *').count();
  const countBefore = await shown();
  await expect.poll(shown, { timeout: 15_000, intervals: [100] }).not.toBe(countBefore);
  expect(await shown()).toBe(countBefore + 1);

  const before = await snapshot(page);
  const undrawn = before.cells.find((c) => !before.drawn.includes(c.value));
  if (undrawn === undefined) throw new Error('every owner number already drawn');
  await page.getByTestId(undrawn.testId).click();
  await expect(feedback).toHaveText('Not drawn yet — refused');
  await expect(page.getByTestId(undrawn.testId)).toHaveAttribute('data-marked', 'false');

  // Checks "Marked · +" itself: the feedback line shows the latest event, so another
  // number's window closing can replace it a moment later.
  const tapped = await tapInsideWindow(page);

  const missed = await nextDrawnOwnerCell(page, tapped);
  await expect(page.getByTestId(missed.testId)).toHaveAttribute('data-marked', 'false');
  await expect(page.getByTestId(missed.testId)).toHaveAttribute('data-marked', 'true', {
    timeout: SPEED_WINDOW_MS + 2_000,
  });
  await expect(feedback).toContainText('without bonus (window closed)');
});
