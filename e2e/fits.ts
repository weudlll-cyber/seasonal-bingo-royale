/**
 * @file   e2e/fits.ts
 * @module e2e
 * @brief  A page as it stands, swept at a desktop and a phone, at three font sizes, in both themes.
 *
 * Responsibility: `expectFits` runs the kit's `sweep` on the screen the spec has brought up (its
 *                 state is kept: the page is only scrolled to the top, not reloaded): 1280×720
 *                 and 390×844 at 100, 125 and 150 %, light and dark. The kit's probe fails on
 *                 sideways scroll, a box past the window, cut text, a control under 44 px and a
 *                 clipped fitted root; axe's WCAG 2 A and AA rules run too, and Bingo's own
 *                 rules with them: no text under 14 px and no text covered
 *                 (./acceptance/fitProbe). The font and theme are put back afterwards.
 * Depends on:     @axe-core/playwright, @playwright/test, @seasonal/kit/testing,
 *                 ./acceptance/fitProbe
 * Used by:        the admin specs, ./startMatch.spec
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/concepts/fit-audit.md
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { axeFinder, setTheme, sweep, type AxeFinder } from '@seasonal/kit/testing';

import { probe } from './acceptance/fitProbe.js';

const standard = axeFinder(AxeBuilder);

// axe, then Bingo's text floor and overlap check (the sweep takes one finder).
const withOwnRules: AxeFinder = async (page) => {
  const own = await probe(page);
  return [
    ...(await standard(page)),
    ...own.smallText.map((t) => `text below 14 px: ${t.sel} "${t.text}" ${String(t.px)} px`),
    ...own.overlaps.map((o) => `text covered: ${o.a} / ${o.b}`),
  ];
};

export async function expectFits(page: Page, name: string): Promise<void> {
  // From the top: what is scrolled under a sticky bar is no overlap.
  const open = (shown: Page) =>
    shown.evaluate(() => {
      window.scrollTo(0, 0);
    });
  try {
    await sweep(page, [{ name, open }], {
      axe: withOwnRules,
      sizes: [
        { width: 1280, height: 720 },
        { width: 390, height: 844 },
      ],
      fonts: [16, 20, 24],
    });
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await setTheme(page, 'light');
  }
}
