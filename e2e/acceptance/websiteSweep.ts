/**
 * @file   e2e/acceptance/websiteSweep.ts
 * @module e2e/acceptance
 * @brief  The website-mode sweep (measurement only): a screen at ten window sizes, light and dark, chat closed and open, with axe.
 *
 * Responsibility: `sweep` measures one game screen inside the website stand-in (../websiteStack) at
 *                 the ten sizes of the night of 2026-11-23 (six desktop, four phone), root font
 *                 16 px, both themes, chat closed and open (a phone's sheet; the desktop strip is
 *                 always there): fit probe (./fitProbe), round screens' key boxes (./fitMeasure)
 *                 and axe (WCAG 2 A and AA) on the game's page, chat frame left out. One JSON line
 *                 per measurement to reports/logs/<tag>-website-sweep.jsonl. SBR_SWEEP_SIZES
 *                 ("1280x720,375x667") narrows the sizes; SBR_SWEEP_SHOTS=<folder> saves one
 *                 picture per screen at 1280x720 and 390x844 (light, chat open) for a review.
 *                 Helpers sign a stand-in member in via the proxy and post with the CSRF token.
 * Depends on:     node:fs, node:path, @playwright/test, @axe-core/playwright, ../devStack,
 *                 ../screens, ../websiteStack (types), ./fitMeasure, ./fitProbe
 * Used by:        ./fitAudit.spec
 * Spec:           docs/concepts/fit-audit.md §7; docs/spec/01-game-design.md §13
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, type APIResponse, type Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import { setTheme } from '../screens.js';
import type { WebsiteStack } from '../websiteStack.js';
import { atSize, findingsOf, keysOutOf, ROUND_KEYS } from './fitMeasure.js';
import { probe } from './fitProbe.js';

export const BASE = '/games/bingo';

// The sizes of the docked-layout baseline: six desktop windows, four phones.
const ALL_SIZES = [
  [1280, 720],
  [1366, 768],
  [1536, 768],
  [1440, 900],
  [1900, 860],
  [1920, 1080],
  [375, 667],
  [360, 780],
  [390, 844],
  [430, 932],
] as const;

// SBR_SWEEP_SIZES="1280x720,375x667" narrows the sweep (a quick look); else all ten.
const ONLY = process.env['SBR_SWEEP_SIZES']?.split(',') ?? null;
export const SWEEP_SIZES = ALL_SIZES.filter(
  ([w, h]) => ONLY === null || ONLY.includes(`${String(w)}x${String(h)}`),
);

const TAG = process.env['SBR_FIT_TAG'] ?? 'fit';
const SHOTS = process.env['SBR_SWEEP_SHOTS'] ?? null;
const LOG = path.join(REPO_ROOT, 'reports', 'logs', `${TAG}-website-sweep.jsonl`);

export function freshSweep(): void {
  mkdirSync(path.dirname(LOG), { recursive: true });
  writeFileSync(LOG, '');
}

// A member of the stand-in website, signed in through its proxy; lands on the lobby.
export async function signInMember(page: Page, stack: WebsiteStack, id: string): Promise<void> {
  const name = stack.users.get(id)?.name ?? '';
  await page.context().addCookies([{ name: 'stub_user', value: id, url: stack.origin }]);
  await page.goto(`${stack.origin}${BASE}/auth/website?next=${BASE}/%23/`);
  await expect(page.getByTestId('signed-in-as')).toContainText(name, { timeout: 30_000 });
}

// The page's POST under the game's base with its CSRF token (a new match says it comes from
// a development tool, as ../realGame post does).
export async function webPost(
  page: Page,
  stack: WebsiteStack,
  url: string,
  data: Record<string, unknown>,
): Promise<APIResponse> {
  const session = (await (
    await page.request.get(`${stack.origin}${BASE}/api/v1/session`)
  ).json()) as {
    csrfToken: string;
  };
  const body = url === '/matches' ? { ...data, devTools: true } : data;
  return page.request.post(`${stack.origin}${BASE}/api/v1${url}`, {
    data: body,
    headers: { 'x-csrf-token': session.csrfToken },
  });
}

// The website's chat in the dock under the match. On a desktop the strip is always in sight, so
// "closed" and "open" measure the same page. On a phone "open" is the sheet the kit's bar
// opens, "closed" the bar alone. Called after the window has its size (the view follows it).
async function setChat(page: Page, open: boolean): Promise<void> {
  const bar = page.getByTestId('chat-bar');
  if (!(await bar.isVisible())) return;
  const sheet = page.getByRole('dialog', { name: 'Chat' });
  if ((await sheet.isVisible()) === open) return;
  if (open) await bar.click();
  else await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeVisible({ visible: open });
}

// The docked layout's game area scrolling inside the one-window page counts as page scroll: the
// player would have to scroll to see the whole screen (the probe measures the page itself).
const areaOf = (page: Page): Promise<{ client: number; scroll: number } | null> =>
  page.evaluate(() => {
    const area = document.querySelector('.sk-docked-main');
    return area === null ? null : { client: area.clientHeight, scroll: area.scrollHeight };
  });

// A phone's chat bar: whether it lies wholly inside the window (null on a desktop, no bar).
// Looked at only when it is shown: `boundingBox()` of a missing element waits for it, without end.
async function barInWindow(page: Page): Promise<boolean | null> {
  const bar = page.getByTestId('chat-bar');
  if (!(await bar.isVisible())) return null;
  const box = await bar.boundingBox();
  const view = page.viewportSize();
  if (box === null || view === null) return null;
  return (
    box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height
  );
}

// axe on the game's page (WCAG 2 A and AA); the website's chat page in its frame is left out.
// Each rule with the elements it names (axe's selectors, the first three).
async function axeOf(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('[data-testid="chat-frame"]')
    .analyze();
  return result.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
}

// One screen at every sweep size, both themes, chat closed and open; `kind` names a round
// screen's key boxes (./fitMeasure ROUND_KEYS).
export async function sweep(page: Page, screen: string, kind?: string): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    for (const chat of ['closed', 'open'] as const) {
      // Switched where nothing folds: the toggles sit in the folded menu on a phone.
      await atSize(page, 1920, 1080, 16);
      await setTheme(page, theme);
      for (const [w, h] of SWEEP_SIZES) {
        await atSize(page, w, h, 16);
        await setChat(page, chat === 'open');
        const measured = await probe(page);
        const area = await areaOf(page);
        const bar = await barInWindow(page);
        const scrolls = area !== null && area.scroll > area.client + 1;
        const p = { ...measured, pageScroll: measured.pageScroll || scrolls };
        const keysOut = await keysOutOf(page, kind === undefined ? undefined : ROUND_KEYS[kind]);
        const round = kind !== undefined;
        const axe = await axeOf(page);
        const size = `${String(w)}x${String(h)}`;
        const sample = {
          ...p,
          screen,
          size,
          theme,
          chat,
          round,
          keysOut,
          area,
          bar,
          axe,
          findings: findingsOf(p, round, keysOut) + (bar === false ? 1 : 0),
        };
        appendFileSync(LOG, `${JSON.stringify(sample)}\n`);
        if (
          SHOTS !== null &&
          theme === 'light' &&
          chat === 'open' &&
          ['1280x720', '390x844'].includes(size)
        ) {
          mkdirSync(SHOTS, { recursive: true });
          await page.screenshot({ path: path.join(SHOTS, `${screen}-${size}.png`) });
        }
      }
    }
  }
  await atSize(page, 1920, 1080, 16);
  await setTheme(page, 'light');
}
