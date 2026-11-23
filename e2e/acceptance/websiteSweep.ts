/**
 * @file   e2e/acceptance/websiteSweep.ts
 * @module e2e/acceptance
 * @brief  The website-mode sweep (measurement only): a screen at ten window sizes, light and dark, chat closed and open, with axe.
 *
 * Responsibility: the baseline for the docked layout (kit K18, docs/concepts/kit-adoption.md
 *                 §5 B7). `sweep` measures one screen of the game inside the website stand-in
 *                 (../websiteStack) at the ten sizes of the night of 2026-11-23 (six desktop,
 *                 four phone) with the root font at 16 px, in both themes, with the website's
 *                 chat closed and open (the dock beside the match): the fit probe (./fitProbe),
 *                 the round screens' key boxes (./fitMeasure) and axe (WCAG 2 A and AA rules)
 *                 on the game's own page, the chat frame left out (the website's page). One
 *                 JSON line per measurement to reports/logs/<tag>-website-sweep.jsonl; no
 *                 screenshots. The helpers sign a stand-in website member in through the
 *                 website's proxy and post with the page's CSRF token under /games/bingo/.
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
export const SWEEP_SIZES = [
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

const TAG = process.env['SBR_FIT_TAG'] ?? 'fit';
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

// The website's chat beside the match: opened with the dock's toggle, closed with its button.
async function setChat(page: Page, open: boolean): Promise<void> {
  const panel = page.getByTestId('chat-panel');
  if ((await panel.isVisible()) === open) return;
  await page.getByTestId(open ? 'chat-toggle' : 'chat-close').click();
  await expect(panel).toBeVisible({ visible: open });
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
      await setChat(page, chat === 'open');
      for (const [w, h] of SWEEP_SIZES) {
        await atSize(page, w, h, 16);
        const p = await probe(page);
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
          axe,
          findings: findingsOf(p, round, keysOut),
        };
        appendFileSync(LOG, `${JSON.stringify(sample)}\n`);
      }
    }
  }
  await atSize(page, 1920, 1080, 16);
  await setChat(page, false);
  await setTheme(page, 'light');
}
