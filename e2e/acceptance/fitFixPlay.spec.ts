/**
 * @file   e2e/acceptance/fitFixPlay.spec.ts
 * @module e2e/acceptance
 * @brief  One royale played through on a phone (390×844) and a desktop (1280×720) after the fit fixes.
 *
 * Responsibility: the host plays along at 1280×720, a second player on a 390×844 phone, a third
 *                 account watches; bots fill to 20 and the server draws by itself. Both players
 *                 tap every number. At each state (the lobby, the leaderboard, the phone menu
 *                 closed and open, the live round as a player and as a spectator, the interlude,
 *                 the final results) the screen is saved light and dark at both sizes as
 *                 reports/screens/latest/fitfix-<screen>-<size>-<light|dark>.jpg and measured
 *                 with ./fitProbe; every finding goes as one JSON line to
 *                 reports/logs/fitfix-play.jsonl. SBR_FIT_FULL=1 plays the royale at its full
 *                 length in real time; otherwise the fast test rules. The match is stopped at the
 *                 end; no account is created. SBR_ACCEPTANCE=1 only, Chromium.
 * Depends on:     node:fs, node:path, @playwright/test, ../realGame, ../screens, ../devStack,
 *                 ./fitProbe, ./screenPlay
 * Spec:           docs/concepts/fit-audit.md (after the fixes); CLAUDE.md (one realtime royale)
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import {
  closeContexts,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  post,
  signIn,
  stopMatch,
  type Who,
} from '../realGame.js';
import { captureThemes, SHOTS_DIR } from '../screens.js';
import { probe } from './fitProbe.js';
import { tapCurrent, until } from './screenPlay.js';

const FULL = process.env['SBR_FIT_FULL'] === '1';
const LOG = path.join(REPO_ROOT, 'reports', 'logs', 'fitfix-play.jsonl');
const SIZES = {
  '390x844': { width: 390, height: 844 },
  '1280x720': { width: 1280, height: 720 },
} as const;
type Size = keyof typeof SIZES;

test.use({ trace: 'off' });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function newPage(browser: Browser, who: Who, size: Size): Promise<Page> {
  const page = await (await browser.newContext({ viewport: SIZES[size] })).newPage();
  await signIn(page, who);
  return page;
}

// Saves the screen light and dark at one size and logs what the fit probe finds there.
async function shot(page: Page, screen: string, size: Size): Promise<void> {
  const before = page.viewportSize();
  await page.setViewportSize(SIZES[size]);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  const p = await probe(page);
  const found = {
    smallText: p.smallText,
    smallCells: p.smallCells,
    cut: p.cut,
    outside: p.outside,
    overlaps: p.overlaps,
    hScroll: p.hScroll,
  };
  appendFileSync(LOG, `${JSON.stringify({ screen, size, ...found })}\n`);
  await captureThemes(page, SHOTS_DIR, `fitfix-${screen}-${size}`);
  if (before !== null) await page.setViewportSize(before);
}

async function bothSizes(page: Page, screen: string): Promise<void> {
  await shot(page, screen, '390x844');
  await shot(page, screen, '1280x720');
}

// The lobby, the leaderboard and the phone menu closed and open, before the start.
async function pagesBefore(watcher: Page): Promise<void> {
  await watcher.goto('/#/');
  await expect(watcher.getByTestId('lobby-list')).toBeVisible();
  await bothSizes(watcher, 'lobby');
  await watcher.setViewportSize(SIZES['390x844']);
  await captureThemes(watcher, SHOTS_DIR, 'fitfix-menu-closed-390x844');
  await watcher.getByTestId('menu-button').click();
  await expect(watcher.getByTestId('sign-out')).toBeVisible();
  await watcher.screenshot({
    path: path.join(SHOTS_DIR, 'fitfix-menu-open-390x844-light.jpg'),
    quality: 75,
  });
  await watcher.keyboard.press('Escape');
  await watcher.goto('/#/leaderboard');
  await expect(watcher.getByTestId('leaderboard-page')).toBeVisible();
  await bothSizes(watcher, 'leaderboard');
}

// Plays until the end: both players tap; the round and the interlude are saved once each.
async function playThrough(desk: Page, phone: Page, watcher: Page): Promise<void> {
  let live = false;
  let pause = false;
  const done = desk.getByTestId('final-placement');
  await until(
    desk,
    done,
    async () => {
      await tapCurrent(desk).catch(() => undefined);
      await tapCurrent(phone).catch(() => undefined);
      const draws = await desk.locator('[data-testid="draw-ticker"] > *').count();
      if (!live && draws >= 4) {
        live = true;
        await shot(desk, 'player', '1280x720');
        await shot(phone, 'player', '390x844');
        await bothSizes(watcher, 'spectator');
      }
      if (!pause && (await desk.getByTestId('interlude').count()) > 0) {
        pause = true;
        await shot(desk, 'interlude', '1280x720');
        await shot(phone, 'interlude', '390x844');
      }
    },
    FULL ? 150 : 20,
  );
}

test('fit fixes: a royale on a phone and a desktop', async ({ browser }) => {
  test.setTimeout((FULL ? 160 : 30) * 60_000);
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(LOG, '');
  const desk = await newPage(browser, 'host', '1280x720');
  const code = await hostMatch(desk, {
    title: 'Fit fixes',
    gameType: 'royale',
    drawMode: 'auto',
    missed: 'autoMarkAfter',
    maxPlayers: 20,
    fast: !FULL,
  });
  try {
    expect((await post(desk, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
    const phone = await newPage(browser, 'player-2', '390x844');
    await joinFromLobby(phone, code);
    const watcher = await newPage(browser, 'player-1', '1280x720');
    await pagesBefore(watcher);
    await fillAndStart(desk, 20);
    await desk.goto(`/#/match/${code}`);
    await phone.goto(`/#/match/${code}`);
    await watcher.goto(`/#/match/${code}`);
    await expect(desk.getByTestId('arena')).toBeVisible({ timeout: 30_000 });
    await playThrough(desk, phone, watcher);
    await expect(phone.getByTestId('final-placement')).toBeVisible({ timeout: 30_000 });
    await shot(desk, 'results', '1280x720');
    await shot(phone, 'results', '390x844');
  } finally {
    await stopMatch(desk, code);
  }
});
