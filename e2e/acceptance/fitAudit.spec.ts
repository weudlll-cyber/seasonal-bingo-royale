/**
 * @file   e2e/acceptance/fitAudit.spec.ts
 * @module e2e/acceptance
 * @brief  Fit audit (measurement only): every screen at seven window sizes and three font sizes.
 *
 * Responsibility: opens every screen a player, host or guest sees (the routes of
 *                 apps/web/src/shell/router.ts and the states of a real royale and classic match
 *                 with bots: lobby, waiting room, round, spectator with the top 4 and one followed
 *                 card, interlude, final results; the maintenance page; a website guest) and
 *                 measures each at 360×640 to 2560×1440 with the root font at 16, 20 and 24 px
 *                 (a larger browser font: every size is in rem) in the light theme (./fitProbe;
 *                 the round screens also with ../layoutChecks). Every measurement goes as one
 *                 JSON line to reports/logs/fit-<group>.jsonl; a combination with a finding is
 *                 saved light and dark as reports/screens/latest/fit-<screen>-<size>-<font>-*.jpg,
 *                 a passing one at 390×844 and 1920×1080 (16 px) light as the reference. The
 *                 spectator's card numbers are also compared at three floors (today, 14 px, 16 px)
 *                 injected as CSS from here (fit-cards-<size>-<floor>.jpg, fit-cards.jsonl).
 *                 Matches are aborted at the end; no account is created. Runs only with
 *                 SBR_ACCEPTANCE=1, Chromium, one worker (it switches maintenance on and off).
 * Depends on:     node:fs, node:path, @playwright/test, ../realGame, ../screens, ../layoutChecks,
 *                 ../devStack, ../websiteStack, ./fitProbe, ./screenPlay
 * Spec:           docs/concepts/fit-audit.md; docs/spec/01-game-design.md §13
 */
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import { layoutReport } from '../layoutChecks.js';
import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  post,
  signIn,
  stopMatch,
  type Who,
} from '../realGame.js';
import { setTheme, SHOTS_DIR } from '../screens.js';
import { startWebsiteStack } from '../websiteStack.js';
import { probe, type Probe } from './fitProbe.js';
import { tapCurrent } from './screenPlay.js';

test.use({ trace: 'off' });
test.describe.configure({ mode: 'default' });

const LOGS = path.join(REPO_ROOT, 'reports', 'logs');
const FLAG = path.join(REPO_ROOT, 'apps', 'server', 'data', 'maintenance');

const SIZES = [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
] as const;
const FONTS = [16, 20, 24] as const;
const REFERENCE = new Set(['390x844', '1920x1080']);

// What a round screen must show in one window (playerFit's rule): ball, numbers, the cards.
const ROUND_KEYS: Readonly<Record<string, Record<string, string>>> = {
  console: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    'Draw next': '[data-testid="host-draw-next"]',
  },
  player: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    card: '.own-cards .live-card',
  },
  spectator: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    'watched cards': '[data-testid="watch-cards"]',
  },
};

interface Sample extends Probe {
  readonly screen: string;
  readonly size: string;
  readonly font: number;
  readonly round: boolean;
  // Round screens: the key boxes (ROUND_KEYS) not wholly inside the window.
  readonly keysOut: readonly string[];
  readonly findings: number;
}

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function newPage(browser: Browser, who: Who | null): Promise<Page> {
  const context = await browser.newContext({ bypassCSP: true, colorScheme: 'light' });
  const page = await context.newPage();
  if (who !== null) await signIn(page, who);
  return page;
}

async function atSize(page: Page, w: number, h: number, font: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate((px) => {
    document.documentElement.style.fontSize = px === 16 ? '' : `${String(px)}px`;
    window.scrollTo(0, 0);
  }, font);
  // Two frames and a moment for observers (the standings' own-row strip) to follow.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(250);
}

const hasToggle = async (page: Page) => (await page.getByTestId('theme-toggle').count()) > 0;

async function shoot(page: Page, name: string, dark: boolean): Promise<void> {
  const file = (theme: string) => path.join(SHOTS_DIR, `${name}-${theme}.jpg`);
  await page.screenshot({ path: file('light'), quality: 70, type: 'jpeg' });
  if (!dark || !(await hasToggle(page))) return;
  await setTheme(page, 'dark');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: file('dark'), quality: 70, type: 'jpeg' });
  await setTheme(page, 'light');
}

function findingsOf(p: Probe, round: boolean, keysOut: readonly string[]): number {
  return (
    p.smallText.length +
    p.smallCells.length +
    p.cut.length +
    p.outside.length +
    p.overlaps.length +
    (p.hScroll ? 1 : 0) +
    (round && p.pageScroll ? 1 : 0) +
    keysOut.length
  );
}

async function keysOutOf(page: Page, keys: Record<string, string> | undefined): Promise<string[]> {
  if (keys === undefined) return [];
  const report = await layoutReport(page, keys);
  const { width, height } = report.view;
  return Object.entries(report.boxes)
    .filter(
      ([, b]) =>
        b === null || b.top < 0 || b.left < 0 || b.bottom > height + 0.5 || b.right > width + 0.5,
    )
    .map(([name]) => name);
}

// Every size and font of one screen; `kind` names a round screen's key boxes.
async function measure(page: Page, group: string, screen: string, kind?: string): Promise<void> {
  if (await hasToggle(page)) await setTheme(page, 'light');
  for (const [w, h] of SIZES) {
    for (const font of FONTS) {
      const size = `${String(w)}x${String(h)}`;
      await atSize(page, w, h, font);
      const p = await probe(page);
      const keysOut = await keysOutOf(page, kind === undefined ? undefined : ROUND_KEYS[kind]);
      const round = kind !== undefined;
      const sample: Sample = {
        ...p,
        screen,
        size,
        font,
        round,
        keysOut,
        findings: findingsOf(p, round, keysOut),
      };
      appendFileSync(path.join(LOGS, `fit-${group}.jsonl`), `${JSON.stringify(sample)}\n`);
      const name = `fit-${screen}-${size}-${String(font)}`;
      if (sample.findings > 0) await shoot(page, name, true);
      else if (font === 16 && REFERENCE.has(size)) await shoot(page, name, false);
    }
  }
  await atSize(page, 1280, 720, 16);
}

function fresh(group: string): void {
  mkdirSync(LOGS, { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(path.join(LOGS, `fit-${group}.jsonl`), '');
}

// Opens a route and waits for one of its test ids ("a|b": either).
async function visit(page: Page, hash: string, testIds: string): Promise<void> {
  await page.goto(`/#/${hash}`);
  const sel = testIds
    .split('|')
    .map((id) => `[data-testid="${id}"]`)
    .join(', ');
  await expect(page.locator(sel).first()).toBeVisible({ timeout: 20_000 });
}

test('fit: the pages without a match', async ({ browser }) => {
  test.setTimeout(60 * 60_000);
  fresh('pages');
  const guest = await newPage(browser, null);
  const pages = [
    ['', 'lobby-guest', 'lobby-list|lobby-empty'],
    ['sign-in', 'sign-in', 'sign-in-form'],
    ['register', 'register', 'register-form'],
    ['forgot-password', 'forgot-password', 'forgot-form'],
    ['reset-password', 'reset-password', 'reset-form'],
    ['leaderboard', 'leaderboard', 'leaderboard-page'],
    ['players/dev-host', 'profile', 'profile-page'],
  ] as const;
  for (const [hash, screen, id] of pages) {
    await visit(guest, hash, id);
    await measure(guest, 'pages', screen);
  }
  const host = await newPage(browser, 'host');
  const signedIn = [
    ['', 'lobby', 'lobby-list|lobby-empty'],
    ['account', 'account', 'account-page'],
    ['host/new', 'host-new', 'create-match'],
    ['quicktest', 'quicktest', 'test-page'],
  ] as const;
  for (const [hash, screen, id] of signedIn) {
    await visit(host, hash, id);
    await measure(host, 'pages', screen);
  }
});

// Host draws until the match waits for its host (a round's end) or `done` shows on the host.
async function drawUntil(host: Page, tapper: Page, done: string): Promise<void> {
  const next = host.getByTestId('host-next-round');
  const ready = host.locator('[data-testid="host-draw-next"]:enabled');
  const target = host.locator(done);
  for (let i = 0; i < 400; i += 1) {
    if ((await target.count()) > 0) return;
    await expect(ready.or(next).or(target).first()).toBeVisible({ timeout: 30_000 });
    if ((await next.count()) > 0 || (await target.count()) > 0) return;
    await drawNext(host);
    await tapCurrent(tapper).catch(() => undefined);
  }
  throw new Error(`not reached: ${done}`);
}

// The spectator's card numbers with a floor injected from here: none (today), 14 px, 16 px.
const FLOORS = [
  [12, null],
  [14, '0.875rem'],
  [16, '1rem'],
] as const;

async function cardComparison(page: Page): Promise<void> {
  writeFileSync(path.join(LOGS, 'fit-cards.jsonl'), '');
  for (const [w, h] of SIZES) {
    for (const [floor, rem] of FLOORS) {
      await page.evaluate((min) => {
        document.getElementById('fit-floor')?.remove();
        if (min === null) return;
        const style = document.createElement('style');
        style.id = 'fit-floor';
        style.textContent = `[data-testid="watch-cards"] [style*="cell-font"] { font-size: max(${min}, var(--cell-font, 0.9rem)) !important; }`;
        document.head.append(style);
      }, rem);
      await atSize(page, w, h, 16);
      const size = `${String(w)}x${String(h)}`;
      const row = { size, floor, ...(await cardFacts(page)) };
      appendFileSync(path.join(LOGS, 'fit-cards.jsonl'), `${JSON.stringify(row)}\n`);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `fit-cards-${size}-${String(floor)}.jpg`),
        quality: 70,
        type: 'jpeg',
      });
    }
  }
  await page.evaluate(() => document.getElementById('fit-floor')?.remove());
}

// Cards shown and whole in the window, per row, the smallest number, numbers wider or taller
// than their cell, and whether the page or the cards' box scrolls.
async function cardFacts(page: Page) {
  const cells = await page.evaluate(cellFacts);
  const layout = await page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = document.documentElement.clientWidth;
    const cards = [...document.querySelectorAll('[data-testid^="watch-card-"]')].filter((c) =>
      c.checkVisibility(),
    );
    const boxes = cards.map((c) => c.getBoundingClientRect());
    const whole = boxes.filter(
      (b) => b.top >= -0.5 && b.bottom <= vh + 0.5 && b.left >= -0.5 && b.right <= vw + 0.5,
    );
    const tops = new Map<number, number>();
    for (const b of boxes)
      tops.set(Math.round(b.top / 4), (tops.get(Math.round(b.top / 4)) ?? 0) + 1);
    const scroller = document.scrollingElement ?? document.documentElement;
    const box = document.querySelector('[data-testid="watch-cards"]');
    return {
      shown: cards.length,
      whole: whole.length,
      perRow: Math.max(0, ...tops.values()),
      pageScroll: scroller.scrollHeight > vh + 1,
      hScroll: scroller.scrollWidth > vw + 1,
      boxScroll: box === null ? false : box.scrollHeight > box.clientHeight + 1,
    };
  });
  return { ...layout, ...cells };
}

// In the page: the watched cards' number sizes and the numbers that spill out of their cell.
function cellFacts(): { minPx: number; sizes: number[]; spill: number } {
  let min = 1e9;
  let spill = 0;
  const sizes = new Set<number>();
  for (const cell of document.querySelectorAll(
    '[data-testid="watch-cards"] [style*="cell-font"]',
  )) {
    if (!cell.checkVisibility()) continue;
    // The number's own text (a season cell also holds its icon below the number).
    const span = cell.firstElementChild ?? cell;
    const text = [...span.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
    if (text === undefined || !/\d/.test(text.textContent ?? '')) continue;
    const px = parseFloat(getComputedStyle(span).fontSize);
    min = Math.min(min, px);
    sizes.add(Math.round(px * 10) / 10);
    const range = document.createRange();
    range.selectNodeContents(text);
    const t = range.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    // Wider than the cell inside its 2 px border, or its digits (the middle 60 % of the
    // em box) taller than that.
    if (t.width > c.width - 4 + 0.5 || t.height * 0.6 > c.height - 4 + 0.5) spill += 1;
  }
  return { minPx: Math.round(min * 10) / 10, sizes: [...sizes].sort((a, b) => a - b), spill };
}

// The lobby side: the console before the start, a player's waiting room and My matches.
async function lobbyScreens(browser: Browser, host: Page, code: string): Promise<void> {
  await measure(host, 'royale', 'console-lobby');
  const joiner = await newPage(browser, 'player-2');
  await joinFromLobby(joiner, code);
  await measure(joiner, 'royale', 'waiting-room');
  await visit(joiner, '', 'my-matches');
  await measure(joiner, 'royale', 'my-matches');
  await joiner.context().close();
}

// A running round: console, the host's own player screen, a spectator (top 4, one followed).
async function roundScreens(host: Page, player: Page, watcher: Page): Promise<void> {
  await measure(host, 'royale', 'console-round', 'console');
  await measure(player, 'royale', 'player-royale', 'player');
  await measure(watcher, 'royale', 'spectator-4', 'spectator');
  await cardComparison(watcher);
  await watcher.locator('.rank-name-btn').first().click();
  await expect(watcher.locator('.watch-cards.is-following')).toBeVisible();
  await measure(watcher, 'royale', 'spectator-1', 'spectator');
  await watcher.getByRole('button', { name: 'Back to the top 4' }).click();
}

test('fit: a royale from the lobby to the results', async ({ browser }) => {
  test.setTimeout(120 * 60_000);
  fresh('royale');
  const host = await newPage(browser, 'host');
  const code = await hostMatch(host, {
    title: 'Fit audit',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'autoMarkAfter',
    maxPlayers: 20,
    pause: 'host',
    fast: true,
  });
  try {
    expect((await post(host, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
    await lobbyScreens(browser, host, code);
    await fillAndStart(host, 20);
    const player = await host.context().newPage();
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 3; i += 1) {
      await drawNext(host);
      await tapCurrent(player).catch(() => undefined);
    }
    const watcher = await newPage(browser, 'player-1');
    await visit(watcher, `match/${code}`, 'watch-cards');
    await roundScreens(host, player, watcher);
    await drawUntil(host, player, '[data-testid="host-status"][data-status="finished"]');
    await expect(player.getByTestId('interlude')).toBeVisible({ timeout: 20_000 });
    await measure(player, 'royale', 'interlude-player');
    await measure(host, 'royale', 'interlude-console');
    await measure(watcher, 'royale', 'interlude-spectator');
    await playToEnd(host, player);
    await expect(player.getByTestId('final-placement')).toBeVisible({ timeout: 30_000 });
    await expect(watcher.getByTestId('final-placement')).toBeVisible({ timeout: 30_000 });
    await measure(player, 'royale', 'results-player');
    await measure(watcher, 'royale', 'results-spectator');
    await measure(host, 'royale', 'results-console');
    await visit(watcher, `verify/${code}`, 'verify-page');
    await measure(watcher, 'royale', 'verify');
  } finally {
    await stopMatch(host, code);
  }
});

// Starts each next round and draws until the match is over.
async function playToEnd(host: Page, player: Page): Promise<void> {
  const finished = '[data-testid="host-status"][data-status="finished"]';
  for (let round = 0; round < 30; round += 1) {
    const next = host.getByTestId('host-next-round');
    if ((await next.count()) > 0) await next.click();
    await expect(next).toHaveCount(0, { timeout: 10_000 });
    await drawUntil(host, player, finished);
    if ((await host.locator(finished).count()) > 0) return;
  }
  throw new Error('the royale did not finish');
}

test('fit: a classic round', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  fresh('classic');
  const host = await newPage(browser, 'host');
  const code = await hostMatch(host, {
    title: 'Fit audit classic',
    gameType: 'classic',
    drawMode: 'host',
    missed: 'autoMarkAfter',
    maxPlayers: 11,
  });
  try {
    expect((await post(host, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
    await fillAndStart(host, 11);
    const player = await host.context().newPage();
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 3; i += 1) await drawNext(host);
    await measure(player, 'classic', 'player-classic', 'player');
  } finally {
    await stopMatch(host, code);
  }
});

test('fit: the maintenance page', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  fresh('maintenance');
  const guest = await newPage(browser, null);
  mkdirSync(path.dirname(FLAG), { recursive: true });
  writeFileSync(FLAG, 'Fit audit: back in a few minutes.');
  try {
    await expect
      .poll(
        async () =>
          ((await (await guest.request.get('/api/v1/maintenance')).json()) as { on: boolean }).on,
        {
          timeout: 5_000,
        },
      )
      .toBe(true);
    await visit(guest, '', 'maintenance-page');
    await measure(guest, 'maintenance', 'maintenance');
  } finally {
    rmSync(FLAG, { force: true });
  }
});

test('fit: a guest in website mode', async ({ browser }) => {
  test.setTimeout(30 * 60_000);
  fresh('website');
  const stack = await startWebsiteStack();
  try {
    const guest = await newPage(browser, null);
    await guest.goto(`${stack.origin}/games/bingo/#/`);
    await expect(
      guest.getByTestId('lobby-list').or(guest.getByTestId('lobby-empty')).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
    await measure(guest, 'website', 'website-guest');
  } finally {
    await stack.close();
  }
});
