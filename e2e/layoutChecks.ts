/**
 * @file   e2e/layoutChecks.ts
 * @module e2e
 * @brief  Layout checks the live-screen specs share, measured in one round trip per screen.
 *
 * Responsibility: one in-page measurement per screen and size (each round trip costs seconds
 *                 in WebKit): the page height, the boxes of the named elements, standings rows
 *                 that cover each other where they are seen (each clipped to its list), the
 *                 ball's letter and number against its circle, and whether the side column
 *                 scrolls itself and shows the top 3 rows and the own row whole; the checks
 *                 over such a report, repeated until the layout has settled after a resize.
 * Depends on:     @playwright/test
 * Used by:        ./playerFit.spec, ./acceptance/clarityScreens.spec, ./acceptance/polishScreens.spec
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, type Page } from '@playwright/test';

interface Box {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

// A standings row with the list it scrolls in.
interface RowBox extends Box {
  readonly name: string;
  readonly list: Box;
}

// What the page reports in one round trip; the checks below work it out in Node.
interface RawLayout {
  readonly pageHeight: number;
  readonly view: { readonly width: number; readonly height: number };
  // Per name: the box of the last element the selector matches, null when none does.
  readonly boxes: Readonly<Record<string, Box | null>>;
  readonly rows: readonly RowBox[];
  // The rows of the list itself (not the copy below it), in order.
  readonly listRows: readonly RowBox[];
  readonly ownRows: readonly RowBox[];
  readonly ball: { readonly box: Box; readonly parts: readonly (Box & { text: string })[] } | null;
  readonly sideScrolls: boolean;
}

export interface LayoutReport extends RawLayout {
  readonly rowsOverlapping: readonly string[];
  readonly ballOutside: readonly string[];
  readonly top3Whole: readonly boolean[];
  // Null when the screen has no own row (a spectator).
  readonly ownWhole: boolean | null;
}

// Everything the checks read, measured in the page at once (each round trip costs seconds
// in WebKit); `boxes` names selectors.
export async function layoutReport(
  page: Page,
  boxes: Readonly<Record<string, string>> = {},
): Promise<LayoutReport> {
  const raw = await page.evaluate((selectors): RawLayout => {
    const rect = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    };
    const rows = (sel: string): RowBox[] =>
      [...document.querySelectorAll(sel)].map((row) => ({
        ...rect(row),
        name: row.getAttribute('data-testid') ?? '',
        list: rect(row.closest('ol') ?? row),
      }));
    const ball = document.querySelector('[data-testid="current-ball"]:not(.ball--empty)');
    const side = document.querySelector('.arena-side');
    return {
      pageHeight: document.scrollingElement?.scrollHeight ?? 0,
      view: { width: window.innerWidth, height: window.innerHeight },
      boxes: Object.fromEntries(
        Object.entries(selectors).map(([name, sel]) => {
          const el = [...document.querySelectorAll(sel)].at(-1);
          return [name, el === undefined ? null : rect(el)];
        }),
      ),
      rows: rows('[data-testid="standings-panel"] .rank-row'),
      listRows: rows('[data-testid="standings"] .rank-row'),
      ownRows: rows('[data-testid="standings-panel"] .rank-row.is-own'),
      ball:
        ball === null
          ? null
          : {
              box: rect(ball),
              parts: [...ball.children].map((el) => ({ ...rect(el), text: el.textContent })),
            },
      sideScrolls: side === null ? false : side.scrollHeight > side.clientHeight + 1,
    };
  }, boxes);
  const whole = (r: RowBox): boolean => visible(r, raw.view.height) >= r.bottom - r.top - 1;
  return {
    ...raw,
    rowsOverlapping: overlapping(raw.rows, raw.view.height),
    ballOutside: raw.ball === null ? [] : outsideCircle(raw.ball.box, raw.ball.parts),
    top3Whole: raw.listRows.slice(0, 3).map(whole),
    ownWhole: raw.ownRows.length === 0 ? null : raw.ownRows.some(whole),
  };
}

// The part of a row seen: clipped to its list and to the window.
function seenSpan(r: RowBox, windowHeight: number): { top: number; bottom: number } {
  return {
    top: Math.max(r.top, r.list.top, 0),
    bottom: Math.min(r.bottom, r.list.bottom, windowHeight),
  };
}

function visible(r: RowBox, windowHeight: number): number {
  const s = seenSpan(r, windowHeight);
  return s.bottom - s.top;
}

// Pairs of rows that cover each other where they are seen.
function overlapping(rows: readonly RowBox[], windowHeight: number): string[] {
  const seen = rows
    .map((r) => ({ name: r.name, ...seenSpan(r, windowHeight) }))
    .filter((r) => r.bottom - r.top > 1);
  return seen.flatMap((a, i) =>
    seen
      .slice(i + 1)
      .filter((b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
      .map((b) => `${a.name} × ${b.name}`),
  );
}

// The ball's letter and number (or icon) whose box has a corner beyond 92 % of the radius.
function outsideCircle(ball: Box, parts: readonly (Box & { text: string })[]): string[] {
  const radius = (ball.right - ball.left) / 2;
  const [cx, cy] = [ball.left + radius, (ball.top + ball.bottom) / 2];
  return parts.flatMap((t) => {
    const corners = [
      [t.left, t.top],
      [t.right, t.top],
      [t.left, t.bottom],
      [t.right, t.bottom],
    ] as const;
    const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    return far <= radius * 0.92
      ? []
      : [`"${t.text}" reaches ${far.toFixed(1)} px of ${radius.toFixed(1)} px`];
  });
}

// The page does not scroll and every named element lies wholly inside the window.
export function expectInWindow(report: LayoutReport, what: string): void {
  expect(report.pageHeight, `${what}: page height within the window`).toBeLessThanOrEqual(
    report.view.height,
  );
  expectBoxesInWindow(report, what);
}

// Every named element lies wholly inside the window (the page scrolled to the top).
export function expectBoxesInWindow(report: LayoutReport, what: string): void {
  const { view } = report;
  for (const [name, box] of Object.entries(report.boxes)) {
    expect(box, `${what} ${name} is on the page`).not.toBeNull();
    if (box === null) continue;
    expect(box.top, `${what} ${name} top`).toBeGreaterThanOrEqual(0);
    expect(box.left, `${what} ${name} left`).toBeGreaterThanOrEqual(0);
    expect(box.bottom, `${what} ${name} bottom`).toBeLessThanOrEqual(view.height + 0.5);
    expect(box.right, `${what} ${name} right`).toBeLessThanOrEqual(view.width + 0.5);
  }
}

// No two standings rows cover each other where they are seen: the viewer's own row never
// sits over another row.
export function expectRowsApartIn(report: LayoutReport, what: string): void {
  expect(report.rowsOverlapping, `${what}: standings rows that cover each other`).toEqual([]);
}

export function expectBallFitsIn(report: LayoutReport, what: string): void {
  expect(report.ballOutside, `${what}: ball text inside the circle`).toEqual([]);
}

// Without any scrolling the side column shows the top 3 standings rows and the viewer's
// own row (when there is one) whole, and has no scrollbar of its own.
export function expectOwnPlaceIn(report: LayoutReport, what: string): void {
  expect(report.sideScrolls, `${what}: the side column has no scrollbar of its own`).toBe(false);
  expect(report.top3Whole, `${what}: the top 3 standings rows whole`).toEqual([true, true, true]);
  if (report.ownWhole !== null) expect(report.ownWhole, `${what}: the own row whole`).toBe(true);
}

// Checks over a fresh measurement, repeated for up to 10 s: after a resize the standings
// move the own row into its strip a few frames later (an IntersectionObserver), and a
// measurement taken at once saw the row below the window (CI, PR #8).
export async function settled(check: () => Promise<void>): Promise<void> {
  await expect(check).toPass({ timeout: 10_000, intervals: [250, 500, 1_000] });
}

export async function expectRowsApart(page: Page, what: string): Promise<void> {
  await settled(async () => {
    expectRowsApartIn(await layoutReport(page), what);
  });
}

export async function expectBallFits(page: Page, what: string): Promise<void> {
  await settled(async () => {
    expectBallFitsIn(await layoutReport(page), what);
  });
}

export async function expectOwnPlaceInView(page: Page, what: string): Promise<void> {
  await settled(async () => {
    expectOwnPlaceIn(await layoutReport(page), what);
  });
}
