/**
 * @file   e2e/acceptance/windowFit.ts
 * @module e2e/acceptance
 * @brief  What does not fit a common browser window: page scroll, scrolling boxes, cut panels.
 *
 * Responsibility: the desktop and laptop windows, their bars taken off, that the game fits (owner
 *                 decision of 2026-11-28), and one in-page measurement of a screen as it stands:
 *                 how far the page scrolls, every box that hides content and by how much, the
 *                 panels not whole in sight, and how many standings rows and result places are
 *                 whole. With SBR_WINDOWS=1 the fit audit measures each screen at every window,
 *                 root font 16 and 32 px (SBR_SWEEP_FONTS), one JSON line each to
 *                 reports/logs/<tag>-windows.jsonl.
 * Depends on:     node:fs, node:path, @playwright/test, ../devStack, ./fitMeasure
 * Used by:        ./fitAudit.spec, ./websiteSweep, ./kitSweep
 * Spec:           docs/spec/01-game-design.md §13; docs/concepts/fit-audit.md §10
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import { atSize } from './fitMeasure.js';

// The sweep looks at the edges: a screen that fits the tightest window fits every larger one
// (owner decision of 2026-11-28). The largest window, the one owner decisions name, and the
// tightest corner (narrower and lower than a 1920×1080 laptop at 150 % without its bars,
// 1278×629, with room for a bookmarks bar).
const DESKTOP_EDGES = [
  [1920, 950],
  [1280, 720],
  [1024, 600],
] as const;
// The common phone and the smallest.
const PHONE_EDGES = [
  [390, 844],
  [320, 568],
] as const;
// Just either side of each width and height where the layout switches between those: the
// desktop layouts from 960 (shell.css), the chat strip's height under 760 and the header's
// account chip under 1600 (kit); the phone rules up to 640 (arena.css) and 480 (results.css).
const DESKTOP_SWITCHES = [
  [960, 600],
  [1280, 759],
  [1280, 760],
  [1599, 950],
  [1600, 950],
] as const;
const PHONE_SWITCHES = [
  [480, 844],
  [481, 844],
  [640, 844],
  [641, 844],
  [959, 600],
] as const;

// Where no screen meant to fit scrolls the page.
export const WINDOWS = [...DESKTOP_EDGES, ...DESKTOP_SWITCHES] as const;
export const SWEEP_SIZES = [...WINDOWS, ...PHONE_EDGES, ...PHONE_SWITCHES] as const;

export const WINDOW_FIT = process.env['SBR_WINDOWS'] === '1';

export interface WindowReport {
  // How far the page itself scrolls, in px.
  readonly page: number;
  // Boxes that hide content below or above: their name, the hidden px and their height.
  readonly boxes: readonly { name: string; hidden: number; high: number }[];
  // Panels not wholly in sight: their name, the px out of sight and their height.
  readonly cut: readonly { name: string; out: number; high: number }[];
  // Standings rows and result places wholly in sight, of how many; null without that list.
  readonly standings: { whole: number; of: number } | null;
  readonly places: { whole: number; of: number } | null;
}

// The parts that must be whole (the standings and the log of lines may scroll in their box).
const PANELS = [
  '.owner-status',
  '.side-panel',
  '.own-cards .live-card',
  '[data-testid="watch-cards"]',
  '[data-testid="current-ball"]',
  '[data-testid="interlude"]',
  '[data-testid="cut-screen"]',
  '[data-testid="host-draw-controls"]',
  '.lobby-item',
  '.waiting-room',
];

export function windowReport(page: Page): Promise<WindowReport> {
  return page.evaluate((panels): WindowReport => {
    const nameOf = (el: Element): string => {
      const id = el.getAttribute('data-testid');
      if (id !== null) return `[${id}]`;
      return `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
    };
    const scrolls = (el: Element) => /auto|scroll|hidden|clip/.test(getComputedStyle(el).overflowY);
    // The part of an element the reader sees: the window less every clipping box around it.
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      let top = Math.max(r.top, 0);
      let bottom = Math.min(r.bottom, window.innerHeight);
      for (let a = el.parentElement; a !== null && a !== document.body; a = a.parentElement) {
        if (!scrolls(a)) continue;
        const box = a.getBoundingClientRect();
        const sign = a.getAttribute('data-more') === 'true';
        const strip = sign ? parseFloat(getComputedStyle(a, '::after').height) || 0 : 0;
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom - strip);
      }
      return { high: r.height, shown: Math.max(0, bottom - top) };
    };
    const all = [...document.body.querySelectorAll<HTMLElement>('*')].filter((el) =>
      el.checkVisibility(),
    );
    const boxes = all
      .filter((el) => /auto|scroll|hidden/.test(getComputedStyle(el).overflowY))
      .filter((el) => el.clientHeight > 20 && el.scrollHeight - el.clientHeight > 1)
      .map((el) => ({
        name: nameOf(el),
        hidden: el.scrollHeight - el.clientHeight,
        high: el.clientHeight,
      }));
    const cut = panels
      .flatMap((sel) => [...document.querySelectorAll(sel)])
      .filter((el) => el.checkVisibility())
      .map((el) => ({ name: nameOf(el), ...seen(el) }))
      .filter((p) => p.high - p.shown > 1)
      .map((p) => ({
        name: p.name,
        out: Math.round(p.high - p.shown),
        high: Math.round(p.high),
      }));
    const wholeOf = (selector: string) => {
      const items = [...document.querySelectorAll(selector)].filter((el) => el.checkVisibility());
      if (items.length === 0) return null;
      const whole = items.filter((el) => {
        const s = seen(el);
        return s.high - s.shown <= 1;
      });
      return { whole: whole.length, of: items.length };
    };
    const root = document.scrollingElement ?? document.documentElement;
    return {
      page: Math.max(0, root.scrollHeight - window.innerHeight),
      boxes,
      cut,
      standings: wholeOf('.standings-panel .rank-list > .rank-row'),
      places: wholeOf('.sk-result .podium-step, .sk-result .rank-row'),
    };
  }, PANELS);
}

const LOG = path.join(
  REPO_ROOT,
  'reports',
  'logs',
  `${process.env['SBR_FIT_TAG'] ?? 'fit'}-windows.jsonl`,
);
const FONTS = (process.env['SBR_SWEEP_FONTS'] ?? '16,32').split(',').map(Number);

// One screen at every window; the page is left at 1280×720 and its own font.
export async function windowLooks(page: Page, screen: string): Promise<void> {
  mkdirSync(path.dirname(LOG), { recursive: true });
  for (const [w, h] of WINDOWS) {
    for (const font of FONTS) {
      await atSize(page, w, h, font);
      const report = await windowReport(page);
      const size = `${String(w)}x${String(h)}`;
      appendFileSync(LOG, `${JSON.stringify({ screen, size, font, ...report })}\n`);
    }
  }
  await atSize(page, 1280, 720, 16);
}
