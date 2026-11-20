/**
 * @file   e2e/acceptance/fitProbe.ts
 * @module e2e/acceptance
 * @brief  The fit audit's in-page measurement: small text, cut text, overflow, page scroll, overlaps.
 *
 * Responsibility: one call in the page per screen, size and font measures every visible text
 *                 element (own text nodes, form fields): its computed font size against 14 px
 *                 times the user's font scale (card numbers, text inside a card cell, against
 *                 16 px), text cut by an ancestor's overflow hidden or by an ellipsis, text or
 *                 boxes beyond the window's sides outside a scrolling box, horizontal and
 *                 vertical page scroll, and text fragments that cover each other or are covered
 *                 by another element. The functions run in the browser: `installProbe` puts
 *                 their source into the page as one script (they call each other by name, so
 *                 they use nothing from outside this file), `probe` calls it.
 * Depends on:     @playwright/test
 * Used by:        ./fitAudit.spec
 * Spec:           docs/concepts/fit-audit.md; docs/spec/01-game-design.md §13
 */
import type { Page } from '@playwright/test';

interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface TextHit {
  readonly sel: string;
  readonly px: number;
  readonly text: string;
}

export interface Probe {
  readonly scale: number;
  readonly view: { readonly width: number; readonly height: number };
  readonly pageScroll: boolean;
  readonly hScroll: boolean;
  // The top bar's height as a share of the window (it takes room from every screen).
  readonly headerShare: number;
  readonly smallText: readonly TextHit[];
  readonly smallCells: readonly TextHit[];
  readonly cut: readonly { sel: string; by: string; text: string }[];
  readonly outside: readonly { sel: string; left: number; right: number }[];
  readonly overlaps: readonly { a: string; b: string }[];
}

// A short CSS path: the nearest test id above, the parent, then the element (tag and first
// two classes each).
function describeEl(el: Element): string {
  const tagOf = (e: Element) =>
    `${e.tagName.toLowerCase()}${[...e.classList]
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join('')}`;
  const own = tagOf(el);
  const id = el.getAttribute('data-testid');
  if (id !== null) return `${own}[data-testid="${id}"]`;
  const parent = el.parentElement;
  const up = parent === null || parent.hasAttribute('data-testid') ? '' : `${tagOf(parent)} > `;
  const holder = el.parentElement?.closest('[data-testid]');
  const at = holder?.getAttribute('data-testid');
  return at === undefined || at === null ? `${up}${own}` : `[data-testid="${at}"] ${up}${own}`;
}

function intersect(a: Rect, b: Rect): Rect {
  return {
    top: Math.max(a.top, b.top),
    left: Math.max(a.left, b.left),
    bottom: Math.min(a.bottom, b.bottom),
    right: Math.min(a.right, b.right),
  };
}

function isEmpty(r: Rect): boolean {
  return r.right - r.left < 1 || r.bottom - r.top < 1;
}

// The box the element and its ancestors let its text be seen in: user-scrolled boxes, and
// hard clips (overflow hidden or clip), with the nearest clipping box named.
function clipsOf(el: Element): { scroll: Rect; hard: Rect; by: string } {
  const all = { top: -1e9, left: -1e9, bottom: 1e9, right: 1e9 };
  let scroll = all;
  let hard = all;
  let by = '';
  for (let a: Element | null = el; a !== null && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    const box = a.getBoundingClientRect();
    const x = cs.overflowX;
    const y = cs.overflowY;
    const scrolls = /auto|scroll/.test(x) || /auto|scroll/.test(y);
    if (scrolls) scroll = intersect(scroll, box);
    if (/hidden|clip/.test(x) || /hidden|clip/.test(y)) {
      hard = intersect(hard, box);
      if (by === '') by = describeEl(a);
    }
  }
  return { scroll, hard, by };
}

const FIELDS =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]), select, textarea';

// Seen by the reader: visible, not text only for screen readers (a 1 px box), not the free
// centre's star.
function readable(el: Element): boolean {
  if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const box = el.getBoundingClientRect();
  return box.width > 1 && box.height > 1 && el.textContent.trim() !== '★';
}

// Visible elements that carry text: own non-blank text nodes, or a form field.
function textElements(): { el: Element; frags: Rect[] }[] {
  const out: { el: Element; frags: Rect[] }[] = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!readable(el)) continue;
    if (el.matches(FIELDS)) {
      out.push({ el, frags: [el.getBoundingClientRect()] });
      continue;
    }
    const frags: Rect[] = [];
    for (const n of el.childNodes) {
      if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim() === '') continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      frags.push(...[...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2));
    }
    if (frags.length > 0) out.push({ el, frags });
  }
  return out;
}

const snippet = (el: Element): string =>
  ((el as HTMLInputElement).value || el.textContent || '').trim().slice(0, 40);

function cutText(el: Element, frags: Rect[]): { cut: string | null; seen: Rect[] } {
  const { scroll, hard, by } = clipsOf(el);
  let cut: string | null = null;
  const seen: Rect[] = [];
  for (const f of frags) {
    const inScroll = intersect(f, scroll);
    if (isEmpty(inScroll)) continue;
    const shown = intersect(inScroll, hard);
    const lost = inScroll.right - inScroll.left - (shown.right - shown.left);
    const lostY = inScroll.bottom - inScroll.top - (shown.bottom - shown.top);
    if (isEmpty(shown) || lost > 1.5 || lostY > 1.5) cut = by;
    if (!isEmpty(shown)) seen.push(shown);
  }
  return { cut, seen };
}

// Text with an ellipsis that hides part of it.
function ellipsed(el: Element): boolean {
  const cs = getComputedStyle(el);
  return cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
}

// Pairs of text fragments of different elements that cover each other noticeably. A text box
// is the font's whole em box; its top and bottom fifth (above capitals, below descenders)
// are left out, so glyphs set close, as the ball's letter over its number, do not count.
function overlapPairs(items: { el: Element; seen: Rect[] }[]): { a: string; b: string }[] {
  const inset = (r: Rect): Rect => {
    const d = (r.bottom - r.top) * 0.2;
    return { top: r.top + d, left: r.left, bottom: r.bottom - d, right: r.right };
  };
  const frags = items.flatMap(({ el, seen }) => seen.map((r) => ({ el, r: inset(r) })));
  frags.sort((p, q) => p.r.top - q.r.top);
  const found = new Map<string, { a: string; b: string }>();
  for (let i = 0; i < frags.length; i += 1) {
    const p = frags[i];
    if (p === undefined) continue;
    for (let j = i + 1; j < frags.length; j += 1) {
      const q = frags[j];
      if (q === undefined || q.r.top >= p.r.bottom) break;
      if (q.el === p.el || q.el.contains(p.el) || p.el.contains(q.el)) continue;
      const o = intersect(p.r, q.r);
      const area = (r: Rect) => (r.right - r.left) * (r.bottom - r.top);
      if (
        o.right - o.left > 2 &&
        o.bottom - o.top > 2 &&
        area(o) > 0.25 * Math.min(area(p.r), area(q.r))
      ) {
        const a = describeEl(p.el);
        const b = describeEl(q.el);
        found.set(`${a}|${b}`, { a, b });
      }
    }
  }
  return [...found.values()];
}

// Text whose middle, inside the window, is under an element that is not its own.
function coveredBy(
  el: Element,
  seen: Rect[],
  view: { width: number; height: number },
): string | null {
  for (const r of seen) {
    const x = (r.left + r.right) / 2;
    const y = (r.top + r.bottom) / 2;
    if (x < 0 || y < 0 || x >= view.width || y >= view.height) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit === null || el.contains(hit) || hit.contains(el)) continue;
    return describeEl(hit);
  }
  return null;
}

// Boxes (not only text) reaching beyond the window's sides outside any scrolling box; the
// outermost one of a chain.
function wideBoxes(view: { width: number }): { sel: string; left: number; right: number }[] {
  const out: { sel: string; left: number; right: number }[] = [];
  const marked = new Set<Element>();
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || (r.right <= view.width + 1 && r.left >= -1)) continue;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    if (el.parentElement !== null && marked.has(el.parentElement)) {
      marked.add(el);
      continue;
    }
    if (clipsOf(el).scroll.left > -1e8) continue;
    marked.add(el);
    out.push({ sel: describeEl(el), left: Math.round(r.left), right: Math.round(r.right) });
  }
  return out;
}

function headerShare(height: number): number {
  const bar = document.querySelector('.shell-bar');
  return bar === null ? 0 : Math.round((bar.getBoundingClientRect().height / height) * 100) / 100;
}

function runProbe(): Probe {
  const scale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
  const view = { width: document.documentElement.clientWidth, height: window.innerHeight };
  const page = document.scrollingElement ?? document.documentElement;
  const result = {
    scale,
    view,
    pageScroll: page.scrollHeight > window.innerHeight + 1,
    hScroll: page.scrollWidth > view.width + 1,
    headerShare: headerShare(view.height),
    smallText: [] as TextHit[],
    smallCells: [] as TextHit[],
    cut: [] as { sel: string; by: string; text: string }[],
    outside: wideBoxes(view),
    overlaps: [] as { a: string; b: string }[],
  };
  const items: { el: Element; seen: Rect[] }[] = [];
  for (const { el, frags } of textElements()) {
    const px = parseFloat(getComputedStyle(el).fontSize);
    const isCell = el.closest('[style*="cell-font"]') !== null;
    const hit = { sel: describeEl(el), px: Math.round(px * 10) / 10, text: snippet(el) };
    if (isCell && px < 16 * scale - 0.05) result.smallCells.push(hit);
    if (!isCell && px < 14 * scale - 0.05) result.smallText.push(hit);
    const c = cutText(el, frags);
    if (ellipsed(el)) result.cut.push({ sel: hit.sel, by: 'ellipsis', text: hit.text });
    else if (c.cut !== null) result.cut.push({ sel: hit.sel, by: c.cut, text: hit.text });
    if (c.seen.length > 0) items.push({ el, seen: c.seen });
    const cover = coveredBy(el, c.seen, view);
    if (cover !== null) result.overlaps.push({ a: hit.sel, b: `covered by ${cover}` });
  }
  result.overlaps.push(...overlapPairs(items));
  return result;
}

const PARTS = [
  describeEl,
  intersect,
  isEmpty,
  clipsOf,
  readable,
  textElements,
  snippet,
  cutText,
  ellipsed,
  overlapPairs,
  coveredBy,
  wideBoxes,
  headerShare,
  runProbe,
];

// Puts the probe into the current document (again after every navigation).
export async function installProbe(page: Page): Promise<void> {
  const has = await page.evaluate(() => 'sbrFitProbe' in window);
  if (has) return;
  const body = PARTS.map((f) => `const ${f.name} = ${f.toString()};`).join('\n');
  await page.addScriptTag({
    content: `(() => { const FIELDS = ${JSON.stringify(FIELDS)};\n${body}\nwindow.sbrFitProbe = runProbe; })();`,
  });
}

export async function probe(page: Page): Promise<Probe> {
  await installProbe(page);
  return page.evaluate(() => (window as unknown as { sbrFitProbe: () => Probe }).sbrFitProbe());
}
