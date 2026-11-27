/**
 * @file   e2e/acceptance/fitAudit.spec.ts
 * @module e2e/acceptance
 * @brief  Fit audit (measurement only): every screen at seven window sizes and three font sizes.
 *
 * Responsibility: opens every screen a player, host or guest sees (the router's routes, states of a
 *                 real royale and classic match with bots, maintenance page, website guest) and
 *                 measures each at 360×640 to 2560×1440, root font 16/20/24 px, light theme
 *                 (./fitProbe; round screens also ../layoutChecks); one JSON line each to
 *                 reports/logs/fit-<group>.jsonl; findings saved light and dark to
 *                 reports/screens/latest/, passing ones only as references. Matches aborted, no
 *                 account created. SBR_ACCEPTANCE=1, Chromium, one worker (toggles maintenance).
 *                 SBR_FIT_SIZES/_FONTS/_TAG/_DOM tune the run; SBR_SWEEP_KIT=1 runs the kit's
 *                 sweep on the same screens instead (./kitSweep).
 * Depends on:     node:fs, node:path, @playwright/test, ../realGame, ../screens, ../devStack,
 *                 ../websiteStack, ./fitMeasure, ./fitProbe, ./kitSweep, ./screenPlay, ./websiteSweep
 * Spec:           docs/concepts/fit-audit.md; docs/spec/01-game-design.md §13
 */
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';
import { setTheme } from '@seasonal/kit/testing';

import { MAINTENANCE_FLAG, REPO_ROOT } from '../devStack.js';
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
import { SHOTS_DIR } from '../screens.js';
import { startWebsiteStack, type WebsiteStack } from '../websiteStack.js';
import { atSize, findingsOf, keysOutOf, ROUND_KEYS } from './fitMeasure.js';
import { probe, type Probe } from './fitProbe.js';
import { dividerWithinFloor, KIT_SWEEP, kitLooks, openMenu } from './kitSweep.js';
import { tapCurrent } from './screenPlay.js';
import { BASE, freshSweep, signInMember, sweep, webPost } from './websiteSweep.js';

test.use({ trace: 'off' });
test.describe.configure({ mode: 'default' });

const LOGS = path.join(REPO_ROOT, 'reports', 'logs');

const ALL_SIZES = [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
] as const;
// SBR_FIT_SIZES="360x640,1280x720" measures only those sizes (a quick check while fixing);
// SBR_FIT_TAG names the logs and shots (default "fit"; "fitafter" keeps the first audit's files).
const ONLY = process.env['SBR_FIT_SIZES']?.split(',');
const SIZES = ALL_SIZES.filter(([w, h]) => ONLY?.includes(`${String(w)}x${String(h)}`) ?? true);
const TAG = process.env['SBR_FIT_TAG'] ?? 'fit';
// SBR_FIT_DOM=1 also saves each screen's page (its styles included) to reports/logs/fit-dom/.
const DOM = path.join(REPO_ROOT, 'reports', 'logs', 'fit-dom');
// SBR_FIT_FONTS="16,32" measures those root font sizes instead.
const FONTS = (process.env['SBR_FIT_FONTS'] ?? '16,20,24').split(',').map(Number);
const REFERENCE = new Set(['390x844', '1920x1080']);

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

// Every size and font of one screen; `kind` names a round screen's key boxes.
async function measure(page: Page, group: string, screen: string, kind?: string): Promise<void> {
  if (KIT_SWEEP) return kitLooks(page, `standalone-${screen}`);
  if (await hasToggle(page)) await setTheme(page, 'light');
  if (process.env['SBR_FIT_DOM'] === '1') {
    mkdirSync(DOM, { recursive: true });
    writeFileSync(path.join(DOM, `${screen}.html`), await page.content());
  }
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
      appendFileSync(path.join(LOGS, `${TAG}-${group}.jsonl`), `${JSON.stringify(sample)}\n`);
      const name = `${TAG}-${screen}-${size}-${String(font)}`;
      if (sample.findings > 0) await shoot(page, name, true);
      else if (font === 16 && REFERENCE.has(size)) await shoot(page, name, false);
    }
  }
  await atSize(page, 1280, 720, 16);
}

function fresh(group: string): void {
  mkdirSync(LOGS, { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(path.join(LOGS, `${TAG}-${group}.jsonl`), '');
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
  if (KIT_SWEEP) return;
  writeFileSync(path.join(LOGS, `${TAG}-cards.jsonl`), '');
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
      appendFileSync(path.join(LOGS, `${TAG}-cards.jsonl`), `${JSON.stringify(row)}\n`);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${TAG}-cards-${size}-${String(floor)}.jpg`),
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
    await expect(player.getByTestId('result')).toBeVisible({ timeout: 30_000 });
    await expect(watcher.getByTestId('result')).toBeVisible({ timeout: 30_000 });
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
  mkdirSync(path.dirname(MAINTENANCE_FLAG), { recursive: true });
  writeFileSync(MAINTENANCE_FLAG, 'Fit audit: back in a few minutes.');
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
    rmSync(MAINTENANCE_FLAG, { force: true });
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

// The website-mode sweep (./websiteSweep): the stand-in website's members, a context each.
const MEMBERS = [
  [9101, 'Sweep_Host'],
  [9102, 'Sweep_Player'],
  [9103, 'Sweep_Watcher'],
] as const;

// The header's worst case: all three of a member's Discord steps.
const STEPS = (
  [
    ['holder', 'Golden', 'a'],
    ['farmer', 'Farmer Bronze', 'b'],
    ['investor', 'Level 2 Investor', 'c'],
  ] as const
).map(([ladder, name, hex]) => ({
  ladder,
  name,
  icon: `/media/step-icons/${hex.repeat(32)}.webp`,
}));

async function memberPage(browser: Browser, stack: WebsiteStack, id: number): Promise<Page> {
  const context = await browser.newContext({ bypassCSP: true, colorScheme: 'light' });
  const page = await context.newPage();
  await signInMember(page, stack, id);
  return page;
}

// A host-drawn match made by the host member; its console opens. Returns its code.
async function webMatch(
  host: Page,
  stack: WebsiteStack,
  game: 'royale' | 'classic',
): Promise<string> {
  const created = await webPost(host, stack, '/matches', {
    title: `Sweep ${game}`,
    gameType: game,
    drawMode: 'host',
    missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_000 },
    countsForLeaderboard: false,
    maxPlayers: 20,
    startRule: { kind: 'host' },
    ...(game === 'royale'
      ? { roundPause: { kind: 'host' }, testProfile: 'fast' }
      : { prizes: ['rows-1'] }),
  });
  expect(created.status(), 'create the match').toBe(201);
  const { code } = (await created.json()) as { code: string };
  await host.goto(`${stack.origin}${BASE}/#/host/${code}`);
  await expect(host.getByTestId('host-console')).toBeVisible({ timeout: 30_000 });
  return code;
}

// Teardown: an open or running match is aborted, never deleted.
async function webStop(host: Page, stack: WebsiteStack, code: string): Promise<void> {
  const match = await host.request.get(`${stack.origin}${BASE}/api/v1/matches/${code}`);
  const { status } = (await match.json()) as { status: string };
  if (status !== 'lobby' && status !== 'running') return;
  const r = await webPost(host, stack, `/matches/${code}/abort`, { reason: 'test cleanup' });
  expect(r.status(), `abort ${code}`).toBeLessThan(300);
}

// Bots through the API (the console's bot field is a development tool, left out of the
// production client the website stand-in serves), then the console's own start.
async function webFillAndStart(
  host: Page,
  stack: WebsiteStack,
  code: string,
  upTo: number,
): Promise<void> {
  expect((await webPost(host, stack, `/matches/${code}/bots`, { upTo })).status()).toBeLessThan(
    300,
  );
  await expect(host.getByTestId('host-players').locator('li')).toHaveCount(upTo, {
    timeout: 30_000,
  });
  await host.getByTestId('start-match').click();
  await expect(host.getByTestId('host-status')).toHaveAttribute('data-status', 'running', {
    timeout: 30_000,
  });
}

// The player joins, the lobby side is swept, the bots fill the match and it starts.
async function webLobby(
  host: Page,
  player: Page,
  stack: WebsiteStack,
  code: string,
): Promise<void> {
  await sweep(host, 'console-lobby');
  expect((await webPost(player, stack, `/matches/${code}/join`, {})).status()).toBe(204);
  await player.goto(`${stack.origin}${BASE}/#/match/${code}`);
  await expect(player.getByTestId('waiting-room')).toBeVisible({ timeout: 30_000 });
  await sweep(player, 'waiting-room');
  await webFillAndStart(host, stack, code, 20);
  await expect(player.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 3; i += 1) {
    await drawNext(host);
    await tapCurrent(player).catch(() => undefined);
  }
}

// The result loaded again, as someone opens it: the client draws the "More below" sign then
// (a result that arrives on an open page gets it only with the next resize or scroll), and the
// floor counts what the sign covers.
async function openedAfresh(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sk-docked-main[data-more="true"]')).toBeAttached();
}

// A round, the interlude after it and the results, for console, player and a spectator.
async function webRoyale(host: Page, player: Page, watcher: Page): Promise<void> {
  await sweep(host, 'console-round', 'console');
  await sweep(player, 'player-royale', 'player');
  await sweep(watcher, 'spectator-4', 'spectator');
  await drawUntil(host, player, '[data-testid="host-status"][data-status="finished"]');
  await expect(player.getByTestId('interlude')).toBeVisible({ timeout: 20_000 });
  await sweep(player, 'interlude-player');
  await sweep(host, 'interlude-console');
  await sweep(watcher, 'interlude-spectator');
  await playToEnd(host, player);
  await expect(player.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(watcher.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  for (const page of [player, watcher, host]) await openedAfresh(page);
  await sweep(player, 'results-player');
  await sweep(watcher, 'results-spectator');
  await sweep(host, 'results-console');
}

test('fit: every match screen in website mode (the docked layout baseline, K18)', async ({
  browser,
}) => {
  test.setTimeout(240 * 60_000);
  freshSweep();
  const stack = await startWebsiteStack();
  for (const [id, name] of MEMBERS) {
    stack.addMember({ id, name, role: 'member', canHost: true, steps: STEPS });
  }
  const host = await memberPage(browser, stack, 9101);
  const codes: string[] = [];
  try {
    await sweep(host, 'header-lobby');
    if (KIT_SWEEP) await kitLooks(host, 'website-header-menu', openMenu);
    codes.push(await webMatch(host, stack, 'royale'));
    const player = await memberPage(browser, stack, 9102);
    await webLobby(host, player, stack, codes[0] ?? '');
    const watcher = await memberPage(browser, stack, 9103);
    await watcher.goto(`${stack.origin}${BASE}/#/match/${codes[0] ?? ''}`);
    await expect(watcher.getByTestId('watch-cards')).toBeVisible({ timeout: 30_000 });
    await webRoyale(host, player, watcher);
    codes.push(await webMatch(host, stack, 'classic'));
    expect((await webPost(player, stack, `/matches/${codes[1] ?? ''}/join`, {})).status()).toBe(
      204,
    );
    await webFillAndStart(host, stack, codes[1] ?? '', 11);
    await player.goto(`${stack.origin}${BASE}/#/match/${codes[1] ?? ''}`);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 3; i += 1) await drawNext(host);
    await sweep(player, 'player-classic', 'player');
  } finally {
    for (const code of codes) await webStop(host, stack, code);
    await stack.removeAccounts();
    await stack.close();
  }
});

// One short royale of 16 players that plays itself to the end, the player taking part; true when
// its result puts the "Out of the match" divider within the first 7 places.
async function royaleToResult(host: Page, player: Page, stack: WebsiteStack): Promise<boolean> {
  const created = await webPost(host, stack, '/matches', {
    title: 'Sweep divider',
    gameType: 'royale',
    drawMode: 'auto',
    drawIntervalMs: 4_000,
    missedNumbers: { kind: 'autoMarkAfter', delayMs: 3_000 },
    countsForLeaderboard: false,
    maxPlayers: 16,
    roundPause: { kind: 'wait', ms: 5_000 },
    startRule: { kind: 'host' },
    testProfile: 'fast',
  });
  expect(created.status(), 'create the match').toBe(201);
  const { code } = (await created.json()) as { code: string };
  expect((await webPost(player, stack, `/matches/${code}/join`, {})).status()).toBe(204);
  await host.goto(`${stack.origin}${BASE}/#/host/${code}`);
  await webFillAndStart(host, stack, code, 16);
  await player.goto(`${stack.origin}${BASE}/#/match/${code}`);
  for (const page of [player, host]) {
    await expect(page.getByTestId('result')).toBeVisible({ timeout: 8 * 60_000 });
  }
  return dividerWithinFloor(player, 'website-divider-search');
}

// The 7 places' floor on its hard case (owner decision of 2026-11-24): a result whose divider
// stands within the first 7 places, as the player's and the console's screen. 16 players leave 4
// for the final; only shields that save three more move the divider past place 6, so a further
// match is played then.
test('fit: the docked result with the divider among the first 7 places', async ({ browser }) => {
  test.skip(!KIT_SWEEP, "the kit's sweep only");
  test.setTimeout(60 * 60_000);
  const stack = await startWebsiteStack();
  for (const [id, name] of MEMBERS) {
    stack.addMember({ id, name, role: 'member', canHost: true, steps: STEPS });
  }
  try {
    const host = await memberPage(browser, stack, 9101);
    const player = await memberPage(browser, stack, 9102);
    let within = false;
    for (let match = 0; match < 4 && !within; match += 1) {
      within = await royaleToResult(host, player, stack);
    }
    expect(within, 'a result with the divider within the first 7 places').toBe(true);
    for (const page of [player, host]) await openedAfresh(page);
    await sweep(player, 'results-divider-player');
    await sweep(host, 'results-divider-console');
  } finally {
    await stack.removeAccounts();
    await stack.close();
  }
});
