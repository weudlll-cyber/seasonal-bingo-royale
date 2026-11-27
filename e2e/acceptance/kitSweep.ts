/**
 * @file   e2e/acceptance/kitSweep.ts
 * @module e2e/acceptance
 * @brief  The kit's sweep over a screen as it stands, at the audit's sizes, collected not thrown.
 *
 * Responsibility: with SBR_SWEEP_KIT=1 the fit audit looks at each screen with the kit's `sweep`
 *                 instead of measuring: the six desktop sizes and 360×780, 390×844, 430×932, root
 *                 font 16 and 32 px (SBR_SWEEP_FONTS), light and dark; the kit's probe, axe (WCAG
 *                 2 A and AA; the website's chat page in its frame left out) and Bingo's text floor
 *                 and overlap check (./fitProbe). The screen keeps its state (only scrolled to the
 *                 top; fades off, so no line is judged half drawn), and what scrolls a page
 *                 sideways is named. Findings go to reports/logs/<tag>-kit-sweep.log, one a line, so one run
 *                 sees every screen. SBR_SWEEP_SIZES, SBR_SWEEP_SCREENS, SBR_SWEEP_THEMES
 *                 and SBR_SWEEP_BOTH narrow it.
 * Depends on:     node:fs, node:path, @axe-core/playwright, @playwright/test,
 *                 @seasonal/kit/testing, ../devStack, ./fitProbe
 * Used by:        ./fitAudit.spec, ./websiteSweep
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/concepts/fit-audit.md
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { setTheme, sweep, type AxeFinder } from '@seasonal/kit/testing';

import { REPO_ROOT } from '../devStack.js';
import { probe } from './fitProbe.js';

export const KIT_SWEEP = process.env['SBR_SWEEP_KIT'] === '1';

const SIZES = [
  [1280, 720],
  [1366, 768],
  [1536, 768],
  [1440, 900],
  [1900, 860],
  [1920, 1080],
  [360, 780],
  [390, 844],
  [430, 932],
] as const;
const listOf = (name: string): string[] | null => process.env[name]?.split(',') ?? null;
const ONLY_SIZES = listOf('SBR_SWEEP_SIZES');
const ONLY_SCREENS = listOf('SBR_SWEEP_SCREENS');
const FONTS = (listOf('SBR_SWEEP_FONTS') ?? ['16', '32']).map(Number);
// A re-check after a fix: SBR_SWEEP_THEMES="light" where no colour changed, the screens of
// SBR_SWEEP_BOTH still in both.
const BOTH = ['light', 'dark'] as const;
const themesOf = (screen: string) => {
  if (listOf('SBR_SWEEP_BOTH')?.includes(screen) === true) return BOTH;
  return BOTH.filter((t) => listOf('SBR_SWEEP_THEMES')?.includes(t) ?? true);
};
const LOG = path.join(
  REPO_ROOT,
  'reports',
  'logs',
  `${process.env['SBR_FIT_TAG'] ?? 'fit'}-kit-sweep.log`,
);

// No fade while looking: a line still fading in has no contrast yet (a recap's next card
// starts one at any moment).
const STILL = '.sbr-anim-fade, .sbr-anim-mark { animation: none !important; }';

// Where the page scrolls sideways: the innermost boxes past its right edge, hidden ones too
// (the probe names visible ones only).
const widest = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if ((document.scrollingElement?.scrollWidth ?? 0) <= width + 1) return [];
    const past = [...document.body.querySelectorAll('*')].filter(
      (el) => el.getBoundingClientRect().right > width + 1,
    );
    return past
      .filter((el) => !past.some((other) => other !== el && el.contains(other)))
      .slice(0, 4)
      .map((el) => {
        const right = Math.round(el.getBoundingClientRect().right);
        return `past the right edge: ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} in .${el.parentElement?.className ?? ''} to ${String(right)}`;
      });
  });

// axe without the chat frame's page, then Bingo's own two rules (the sweep takes one finder).
const finder: AxeFinder = async (page) => {
  await page.addStyleTag({ content: STILL });
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .exclude('[data-testid="chat-frame"]')
    .analyze();
  const own = await probe(page);
  return [
    ...(await widest(page)),
    ...result.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.map(String).join(' ')).join(', ')}`,
    ),
    ...own.smallText.map((t) => `text below 14 px: ${t.sel} "${t.text}" ${String(t.px)} px`),
    ...own.overlaps.map((o) => `text covered: ${o.a} / ${o.b}`),
  ];
};

const toTop = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const area of document.querySelectorAll('.sk-docked-main')) area.scrollTop = 0;
  });

// Where the header is folded, its menu opened; else the page from the top.
export async function openMenu(page: Page): Promise<void> {
  await toTop(page);
  const button = page.getByRole('button', { name: 'Menu', exact: true });
  if (!(await button.isVisible())) return;
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

export async function kitLooks(
  page: Page,
  screen: string,
  open: (shown: Page) => Promise<unknown> = toTop,
): Promise<void> {
  // Narrowed by the full name, its mode included ("website-results-player").
  if (ONLY_SCREENS !== null && !ONLY_SCREENS.includes(screen)) return;
  mkdirSync(path.dirname(LOG), { recursive: true });
  try {
    const shown = async (at: Page) => {
      await open(at);
    };
    const looks = await sweep(page, [{ name: screen, open: shown }], {
      axe: finder,
      sizes: SIZES.filter(
        ([w, h]) => ONLY_SIZES === null || ONLY_SIZES.includes(`${String(w)}x${String(h)}`),
      ).map(([width, height]) => ({ width, height })),
      fonts: FONTS,
      themes: themesOf(screen),
    });
    appendFileSync(LOG, `SEEN ${screen}: ${String(looks)} looks, no finding\n`);
  } catch (error) {
    appendFileSync(LOG, `${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await setTheme(page, 'light');
    await page.setViewportSize({ width: 1280, height: 720 });
  }
}
