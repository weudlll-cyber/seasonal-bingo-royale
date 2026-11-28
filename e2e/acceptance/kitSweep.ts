/**
 * @file   e2e/acceptance/kitSweep.ts
 * @module e2e/acceptance
 * @brief  The kit's sweep over a screen as it stands, with Bingo's edges and floors, collected
 *         not thrown.
 *
 * Responsibility: look at one screen with the kit's `sweep`: its default walk (K128) and Bingo's
 *                 `edges` (the owner's window and each side of every width and height where
 *                 Bingo's layout switches); the kit's probe, axe (WCAG 2 A and AA; the website's
 *                 chat page in its frame left out), Bingo's text floor and overlap check
 *                 (./fitProbe), and on a match screen or a lobby in a desktop window at 16 px that
 *                 neither the page nor the game area scrolls (K127). The owner's floors: the
 *                 standings' first 3 whole, the spectator's four cards whole at 1280×720 and
 *                 1278×629, the docked result at least 7 places at 1280×720 (K116), where the log
 *                 also says whether the "Out of the match" divider fell within them. The screen
 *                 keeps its state (only scrolled to the top); the interlude screens are looked at
 *                 with reduced motion. Findings go to reports/logs/<tag>-kit-sweep.log, one a
 *                 line, so one run sees every screen. A re-check after a fix is narrowed:
 *                 SBR_SWEEP_SCREENS names the screens, SBR_SWEEP_SIZES the sizes (light only),
 *                 SBR_SWEEP_FONTS the root fonts, SBR_SWEEP_AXE="off" leaves axe out (a size or
 *                 spacing fix) and "contrast" runs its contrast rule alone (a colour fix).
 * Depends on:     node:fs, node:path, @axe-core/playwright, @playwright/test,
 *                 @seasonal/kit/testing, ../devStack, ./fitProbe
 * Used by:        ./fitAudit.spec, ./websiteSweep
 * Spec:           docs/spec/12-testing-strategy.md §4; docs/concepts/fit-audit.md §11
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
  type Size,
  type VisibleFloor,
} from '@seasonal/kit/testing';

import { REPO_ROOT } from '../devStack.js';
import { probe } from './fitProbe.js';

const sizeOf = (name: string): Size => {
  const [width = 0, height = 0] = name.split('x').map(Number);
  return { width, height };
};

// The owner's window (1920×1080 at 150 % without the browser's bars) and both sides of each
// switch of Bingo's layout: the desktop layout from 960 wide, the phone rules up to 640 and 480,
// the chat strip's height under 760 and the header's account chip under 1600 (kit).
const OWNER = sizeOf('1278x629');
const EDGES = [
  OWNER,
  ...[
    '480x844',
    '481x844',
    '640x844',
    '641x844',
    '959x600',
    '960x600',
    '1280x759',
    '1280x760',
    '1599x950',
    '1600x950',
  ].map(sizeOf),
];

const listOf = (name: string): string[] | null => process.env[name]?.split(',') ?? null;
const ONLY_SCREENS = listOf('SBR_SWEEP_SCREENS');
const ONLY_SIZES = listOf('SBR_SWEEP_SIZES')?.map(sizeOf) ?? null;
const FONTS = listOf('SBR_SWEEP_FONTS')?.map(Number);
const AXE = process.env['SBR_SWEEP_AXE'];
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

// The screens meant to fit (K127): a lobby with a few matches, every match screen; the pages
// without a match scroll like any page.
const FITS = /lobby|waiting-room|royale|classic|round|spectator|interlude|results/;

// Such a screen in a desktop window at 16 px: neither the page nor the game area scrolls.
async function scrollLines(page: Page, screen: string): Promise<string[]> {
  const width = page.viewportSize()?.width ?? 0;
  if (width < 960 || !FITS.test(screen)) return [];
  const scrolls = await page.evaluate(() => {
    if (getComputedStyle(document.documentElement).fontSize !== '16px') return [];
    const over = (el: Element | null, name: string) =>
      el === null || el.scrollHeight - el.clientHeight <= 1
        ? []
        : [`window: ${name} scrolls by ${String(el.scrollHeight - el.clientHeight)} px`];
    return [
      ...over(document.scrollingElement, 'the page'),
      ...over(document.querySelector('.sk-docked-main'), 'the game area'),
    ];
  });
  return scrolls;
}

// The screen's axe run (the kit's rules, in a narrowed re-check none or contrast alone), then
// Bingo's own rules (the sweep takes one finder).
const finderOf = (screen: string): AxeFinder => {
  const axe = AXE === 'off' ? null : AXE === 'contrast' ? contrast : standard;
  return async (page) => {
    const own = await probe(page);
    return [
      ...(await scrollLines(page, screen)),
      ...(axe === null ? [] : await axe(page)),
      ...own.smallText.map((t) => `text below 14 px: ${t.sel} "${t.text}" ${String(t.px)} px`),
      ...own.overlaps.map((o) => `text covered: ${o.a} / ${o.b}`),
    ];
  };
};

const DESKTOPS = ['1920x950', '1280x720', '1024x600', '1278x629'].map(sizeOf);

// The owner's floors, each with the screens it speaks of.
const FLOORS: readonly (VisibleFloor & { readonly on: RegExp })[] = [
  {
    on: /console-round|player-royale|player-classic|spectator|interlude/,
    selector: '.standings-panel .rank-list > .rank-row',
    least: 3,
    first: true,
    decision: 'owner decision of 2026-11-28',
    sizes: DESKTOPS,
  },
  {
    on: /spectator/,
    selector: '[data-testid="watch-cards"] .watch-card',
    least: 4,
    decision: 'owner decision of 2026-11-28',
    sizes: [sizeOf('1280x720'), OWNER],
  },
  {
    on: /^website-results-/,
    selector: '.sk-result .podium-step, .sk-result .rank-row',
    least: 7,
    decision: 'owner decision of 2026-11-24',
    sizes: [sizeOf('1280x720')],
  },
];

const walked = (size: Size) =>
  ONLY_SIZES?.some((s) => s.width === size.width && s.height === size.height) ?? true;

// The floors of a screen that this run can check.
const floorsOf = (screen: string): VisibleFloor[] =>
  FLOORS.filter((f) => f.on.test(screen)).flatMap(({ on: _on, sizes = [], ...floor }) => {
    const seen = sizes.filter(walked);
    return seen.length === 0 || FONTS?.includes(16) === false ? [] : [{ ...floor, sizes: seen }];
  });

// The 7 places' hard case is a result whose "Out of the match" divider stands within them;
// answers whether this one does. The match's seed is the server's, so the log says which case
// each result screen showed.
export async function dividerWithinFloor(page: Page, screen: string): Promise<boolean> {
  const before = await page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll('.sk-result :is(.podium-step, .rank-row, .rank-divider)'),
    ];
    return parts.findIndex((part) => part.classList.contains('rank-divider'));
  });
  const within = before > 0 && before < 7;
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
  const shown = async (at: Page) => {
    await open(at);
  };
  try {
    const floors = floorsOf(screen);
    if (screen.startsWith('website-results-')) await dividerWithinFloor(page, screen);
    if (calm) await page.emulateMedia({ reducedMotion: 'reduce' });
    const looks = await sweep(page, [{ name: screen, open: shown, floors }], {
      axe: finderOf(screen),
      ...(ONLY_SIZES === null ? { edges: EDGES } : { sizes: ONLY_SIZES, themes: ['light'] }),
      ...(FONTS === undefined ? {} : { fonts: FONTS }),
    });
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
