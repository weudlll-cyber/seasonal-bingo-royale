/**
 * @file   e2e/acceptance/kitSweep.ts
 * @module e2e/acceptance
 * @brief  The kit's sweep over a screen as it stands, at the audit's sizes, collected not thrown.
 *
 * Responsibility: with SBR_SWEEP_KIT=1 the fit audit looks at each screen with the kit's `sweep`
 *                 instead of measuring: the edge sizes of ./windowFit (owner decision of
 *                 2026-11-28), light at all of them at root font 16 and 32 px (SBR_SWEEP_FONTS),
 *                 dark once more at 1280×720 and 390×844 at 16 px for contrast; the kit's probe,
 *                 axe (WCAG 2 A and AA; the website's chat page in its frame left out), Bingo's
 *                 text floor and overlap check (./fitProbe), and on a match screen at a desktop
 *                 size at 16 px that the page does not scroll and its panels are whole. The docked result declares its floor of 7
 *                 places whole at 1280×720 (K116; the kit counts no row anything covers, K123),
 *                 and the log says whether the "Out of the match" divider fell within them. The
 *                 screen keeps its state (only scrolled to the top); the interlude screens are
 *                 looked at with reduced motion. Findings go to
 *                 reports/logs/<tag>-kit-sweep.log, one a line, so one run sees every screen.
 *                 A re-check after a fix is narrowed (owner's request of 2026-11-27):
 *                 SBR_SWEEP_SCREENS, _SIZES, _FONTS, _THEMES and _BOTH choose what is looked
 *                 at; SBR_SWEEP_AXE="off" leaves axe out (a size or spacing fix; Bingo's two
 *                 rules stay), and the screens of SBR_SWEEP_CONTRAST (a colour fix) then run
 *                 axe's contrast rule alone, at SBR_SWEEP_CONTRAST_SIZES too.
 * Depends on:     node:fs, node:path, @axe-core/playwright, @playwright/test,
 *                 @seasonal/kit/testing, ../devStack, ./fitProbe, ./windowFit
 * Used by:        ./fitAudit.spec, ./websiteSweep
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/concepts/fit-audit.md
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  axeFinder,
  setTheme,
  sweep,
  type AxeFinder,
  type VisibleFloor,
} from '@seasonal/kit/testing';

import { REPO_ROOT } from '../devStack.js';
import { probe } from './fitProbe.js';
import { SWEEP_SIZES, WINDOWS, windowReport } from './windowFit.js';

export const KIT_SWEEP = process.env['SBR_SWEEP_KIT'] === '1';

const listOf = (name: string): string[] | null => process.env[name]?.split(',') ?? null;
const ONLY_SIZES = listOf('SBR_SWEEP_SIZES');
const ONLY_SCREENS = listOf('SBR_SWEEP_SCREENS');
const FONTS = (listOf('SBR_SWEEP_FONTS') ?? ['16', '32']).map(Number);
// A re-check after a fix: SBR_SWEEP_THEMES="light" where no colour changed, the screens of
// SBR_SWEEP_BOTH still in both.
const AXE_OFF = process.env['SBR_SWEEP_AXE'] === 'off';
const contrastOnly = (screen: string) => listOf('SBR_SWEEP_CONTRAST')?.includes(screen) === true;
const sizesOf = (screen: string) => {
  const added = contrastOnly(screen) ? (listOf('SBR_SWEEP_CONTRAST_SIZES') ?? []) : [];
  return SWEEP_SIZES.filter(([w, h]) => {
    const name = `${String(w)}x${String(h)}`;
    return ONLY_SIZES === null || ONLY_SIZES.includes(name) || added.includes(name);
  });
};
type Size = readonly [number, number];
// Dark changes colours only: once more at these two, at 16 px.
const DARK = ['1280x720', '390x844'];
// The passes over a screen: light everywhere, then dark where it is looked at again; a
// narrowed re-check keeps to SBR_SWEEP_THEMES, with the screens of SBR_SWEEP_BOTH still in both.
const passesOf = (screen: string, sizes: readonly Size[]) => {
  const both = listOf('SBR_SWEEP_BOTH')?.includes(screen) === true;
  const wanted = (theme: string) => both || (listOf('SBR_SWEEP_THEMES')?.includes(theme) ?? true);
  const dark = sizes.filter(([w, h]) => DARK.includes(`${String(w)}x${String(h)}`));
  return [
    { sizes, fonts: FONTS, theme: 'light' as const },
    { sizes: dark, fonts: FONTS.filter((f) => f === 16), theme: 'dark' as const },
  ].filter((p) => wanted(p.theme) && p.sizes.length > 0 && p.fonts.length > 0);
};
const LOG = path.join(
  REPO_ROOT,
  'reports',
  'logs',
  `${process.env['SBR_FIT_TAG'] ?? 'fit'}-kit-sweep.log`,
);

// The website's chat page in its frame is left out of axe.
const CHAT = '[data-testid="chat-frame"]';
const standard = axeFinder(AxeBuilder, { exclude: [CHAT] });
const contrast: AxeFinder = async (page) => {
  const axe = new AxeBuilder({ page }).withRules(['color-contrast']).exclude(CHAT);
  const { violations } = await axe.analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
};

// Screens without a match scroll like any page.
const PAGES = /sign-in|register|forgot|reset|leaderboard|profile|account|host-new|quicktest|verify/;

// A match screen in a desktop window at 16 px: no page scroll, no panel cut (owner decision of
// 2026-11-28).
async function windowLines(page: Page, screen: string): Promise<string[]> {
  const view = page.viewportSize();
  const desktop = WINDOWS.some(([w, h]) => w === view?.width && h === view.height);
  const font = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  if (!desktop || font !== '16px' || PAGES.test(screen)) return [];
  const report = await windowReport(page);
  const area = report.boxes.filter((b) => b.name.includes('sk-docked-main'));
  return [
    ...(report.page > 0 ? [`window: the page scrolls by ${String(report.page)} px`] : []),
    ...area.map((b) => `window: the game area scrolls by ${String(b.hidden)} px`),
    ...report.cut.map((c) => `window: ${c.name} is cut by ${String(c.out)} px`),
  ];
}

// The screen's axe run (the kit's rules, in a narrowed re-check none or contrast alone), then
// Bingo's own two rules (the sweep takes one finder).
const finderOf = (screen: string): AxeFinder => {
  const axe = !AXE_OFF ? standard : contrastOnly(screen) ? contrast : null;
  return async (page) => {
    const own = await probe(page);
    return [
      ...(await windowLines(page, screen)),
      ...(axe === null ? [] : await axe(page)),
      ...own.smallText.map((t) => `text below 14 px: ${t.sel} "${t.text}" ${String(t.px)} px`),
      ...own.overlaps.map((o) => `text covered: ${o.a} / ${o.b}`),
    ];
  };
};

// The docked result's places whole above the chat strip (owner decision of 2026-11-24, K116).
const PLACES: VisibleFloor = {
  selector: '.sk-result .podium-step, .sk-result .rank-row',
  least: 7,
  decision: 'owner decision of 2026-11-24',
  sizes: [{ width: 1280, height: 720 }],
};
const floorsOf = (screen: string, sizes: readonly (readonly [number, number])[]) =>
  screen.startsWith('website-results-') && sizes.some(([w, h]) => w === 1280 && h === 720)
    ? [PLACES]
    : [];

// The floor's hard case is a result whose "Out of the match" divider stands within the first
// 7 places; answers whether this one does. The match's seed is the server's, so the log says
// which case each result screen showed.
export async function dividerWithinFloor(page: Page, screen: string): Promise<boolean> {
  const before = await page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll('.sk-result :is(.podium-step, .rank-row, .rank-divider)'),
    ];
    return parts.findIndex((part) => part.classList.contains('rank-divider'));
  });
  const within = before > 0 && before < PLACES.least;
  const place = before < 0 ? 'no divider' : `divider after place ${String(before)}`;
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(
    LOG,
    `DIVIDER ${screen}: ${place} (${within ? 'within' : 'NOT within'} the first 7)\n`,
  );
  return within;
}

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
  // A recap's next card comes by a timer and fades in while axe may be reading (the kit waits
  // for stillness before axe, not during it): these screens show their cards without the fade.
  const calm = screen.includes('-interlude-');
  try {
    const shown = async (at: Page) => {
      await open(at);
    };
    const sizes = sizesOf(screen);
    const named = { name: screen, open: shown, floors: floorsOf(screen, sizes) };
    if (named.floors.length > 0) await dividerWithinFloor(page, screen);
    if (calm) await page.emulateMedia({ reducedMotion: 'reduce' });
    let looks = 0;
    const found: string[] = [];
    for (const pass of passesOf(screen, sizes)) {
      const floors = pass.theme === 'light' ? named.floors : [];
      looks += await sweep(page, [{ ...named, floors }], {
        axe: finderOf(screen),
        sizes: pass.sizes.map(([width, height]) => ({ width, height })),
        fonts: pass.fonts,
        themes: [pass.theme],
      }).catch((error: unknown) => {
        found.push(error instanceof Error ? error.message : String(error));
        return 0;
      });
    }
    if (found.length > 0) throw new Error(found.join('\n'));
    appendFileSync(LOG, `SEEN ${screen}: ${String(looks)} looks, no finding\n`);
  } catch (error) {
    appendFileSync(LOG, `${error instanceof Error ? error.message : String(error)}\n`);
  } finally {
    if (calm) await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    await setTheme(page, 'light');
    await page.setViewportSize({ width: 1280, height: 720 });
  }
}
