/**
 * @file   e2e/playerFit.spec.ts
 * @module e2e
 * @brief  No page scroll during a round: player screen, spectator screen and host console.
 *
 * Responsibility: in a running round of a real match (host draws, plays along; royale 11 and 40
 *                 players, classic 11) at 1280×720 to 1920×950: no page scroll, key elements in the
 *                 window, standings rows apart, ball text inside it, side column not scrolling, top
 *                 3 and own row whole; on a phone ball, numbers, card in view. One measurement per
 *                 screen/size; Chromium saves player-fit-*. On phones, the host console and
 *                 1280×720 at root font 16/20/24 px (Chromium): no text below 14 px, no card number
 *                 below 16 px times the font scale, nothing cut, covered or too wide
 *                 (./acceptance/fitProbe). Match aborted afterwards, also on failure.
 * Depends on:     @playwright/test, ./realGame, ./layoutChecks, ./screens, ./acceptance/fitProbe
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, test, type Page } from '@playwright/test';

import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  post,
  signIn,
  stopMatch,
} from './realGame.js';
import {
  expectBallFitsIn,
  expectBoxesInWindow,
  expectInWindow,
  expectOwnPlaceIn,
  expectRowsApartIn,
  layoutReport,
  settled,
} from './layoutChecks.js';
import { probe } from './acceptance/fitProbe.js';
import { captureThemes, SHOTS_DIR } from './screens.js';

const DESKTOPS = [
  { name: '1280x720', size: { width: 1280, height: 720 } },
  { name: '1366x768', size: { width: 1366, height: 768 } },
  { name: '1536x730', size: { width: 1536, height: 730 } },
  { name: '1890x850', size: { width: 1890, height: 850 } },
  { name: '1920x950', size: { width: 1920, height: 950 } },
] as const;
const PHONE = { name: 'phone', size: { width: 390, height: 844 } } as const;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function atSize(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

// What each screen must show in one window (selectors; the last match is measured).
const SCREENS = {
  player: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    card: '.own-cards .live-card',
    standings: '[data-testid="standings-panel"]',
    // The row in the list, or its copy below the list while the list has it out of view.
    'own row': '[data-testid="standings-panel"] .rank-row.is-own',
  },
  spectator: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    'watched cards': '[data-testid="watch-cards"]',
    standings: '[data-testid="standings-panel"]',
  },
  console: {
    ball: '[data-testid="current-ball"]',
    'drawn numbers': '[data-testid="draw-ticker"]',
    'Draw next': '[data-testid="host-draw-next"]',
    standings: '[data-testid="standings-panel"]',
  },
} as const satisfies Record<string, Record<string, string>>;

// One measurement per size (WebKit spends seconds on every round trip to the page),
// repeated until the layout has settled after the resize (settled()).
async function checkDesktops(page: Page, screen: keyof typeof SCREENS, label: string) {
  for (const { name, size } of DESKTOPS) {
    await atSize(page, size);
    const what = `${label} ${screen} ${name}`;
    await settled(async () => {
      const report = await layoutReport(page, SCREENS[screen]);
      expectInWindow(report, what);
      expectRowsApartIn(report, what);
      expectBallFitsIn(report, what);
      if (screen !== 'console') expectOwnPlaceIn(report, what);
    });
  }
}

// On a phone: the ball (its text inside), the drawn numbers and the card(s) in view.
async function checkPhone(page: Page, screen: 'player' | 'spectator', label: string) {
  await atSize(page, PHONE.size);
  const first3 = Object.fromEntries(Object.entries(SCREENS[screen]).slice(0, 3));
  const what = `${label} ${screen} phone`;
  await settled(async () => {
    const report = await layoutReport(page, first3);
    expectBoxesInWindow(report, what);
    expectBallFitsIn(report, what);
  });
}

// The viewer's status as the server sends it, with the Summer boost and the Spring growth
// active, a Winter shield charge and two seasons collected: the fullest side column. Every
// answer carries it for the viewer (`me`) as the one entry from step 0: a delta answer
// (since > 0) leaves out the player list and brings its own status, which once replaced an
// injection keyed by the player list (master CI run 45041420629, webkit-mobile).
async function withEffects(page: Page): Promise<void> {
  await page.route('**/api/v1/matches/*/state*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      me: string | null;
      view: { ownerStatus: Record<string, unknown[]> };
    };
    if (body.me !== null) {
      body.view.ownerStatus[body.me] = [
        {
          step: 0,
          multiplier: { factor: 1.5, remainingDraws: 5 },
          growth: { pointsPerMark: 2, remainingDraws: 4 },
          shieldCharges: 1,
          seasons: ['spring', 'summer'],
        },
      ];
    }
    await route.fulfill({ response, json: body });
  });
}

const CASES = [
  { gameType: 'royale', players: 11 },
  { gameType: 'royale', players: 40 },
  { gameType: 'classic', players: 11 },
] as const;

for (const { gameType, players } of CASES) {
  test(`no page scroll during a ${gameType} round with ${String(players)} players`, async ({
    browser,
  }, info) => {
    // Three signed-in tabs at five sizes: WebKit needs the time.
    test.setTimeout(480_000);
    const host = await (await browser.newContext()).newPage();
    await signIn(host, 'host');
    const code = await hostMatch(host, {
      title: 'Fit check',
      gameType,
      drawMode: 'host',
      missed: 'autoMarkAfter',
      maxPlayers: players,
    });
    try {
      // The host plays along, as the owner does in a test match.
      expect((await post(host, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
      await fillAndStart(host, players);
      await drawNext(host);
      await drawNext(host);
      await drawNext(host);
      const label = `${gameType} ${String(players)}`;
      await checkDesktops(host, 'console', label);
      const player = await (await browser.newContext()).newPage();
      await signIn(player, 'host');
      if (gameType === 'royale') await withEffects(player);
      await player.goto(`/#/match/${code}`);
      await expect(player.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
      if (gameType === 'royale') await expect(player.getByTestId('effect-growth')).toBeVisible();
      await checkDesktops(player, 'player', label);
      const watcher = await (await browser.newContext()).newPage();
      await signIn(watcher, 'player-1');
      await watcher.goto(`/#/match/${code}`);
      await expect(watcher.getByTestId('watch-cards')).toBeVisible({ timeout: 20_000 });
      await checkDesktops(watcher, 'spectator', label);
      await checkPhone(player, 'player', label);
      await checkPhone(watcher, 'spectator', label);
      if (info.project.name === 'chromium' && gameType === 'royale' && players === 11) {
        for (const { name, size } of [...DESKTOPS, PHONE]) {
          await atSize(player, size);
          await captureThemes(player, SHOTS_DIR, `player-fit-${name}`);
        }
      }
    } finally {
      await stopMatch(host, code);
    }
  });
}

// Phones, the host console on a phone and larger fonts (fit audit §5 item 8; owner decisions
// of 2026-11-20). Every size at the root font of 16, 20 and 24 px (100, 125, 150 %).
const SMALL = [
  { name: '360x640', size: { width: 360, height: 640 } },
  { name: '390x844', size: { width: 390, height: 844 } },
  { name: '1280x720', size: { width: 1280, height: 720 } },
] as const;
const FONTS = [16, 20, 24] as const;

// What must be whole in the window: on a phone at the default font the ball, the drawn
// numbers and the card(s) or Draw next; on a desktop at every font the ball, the numbers and
// the cards' box (at a large font the cards scroll inside it) or Draw next, no page scroll.
function keysFor(screen: keyof typeof SCREENS, desktop: boolean): Record<string, string> {
  const keys = Object.entries(SCREENS[screen]).slice(0, 3);
  if (!desktop || screen === 'console') return Object.fromEntries(keys);
  return Object.fromEntries([...keys.slice(0, 2), ['cards box', '.arena-cards']]);
}

async function atFont(page: Page, px: number): Promise<void> {
  await page.evaluate((font) => {
    document.documentElement.style.fontSize = font === 16 ? '' : `${String(font)}px`;
  }, px);
}

// No text below 14 px × the font scale, no card number below 16 px × scale, nothing cut,
// covered or wider than the window (./acceptance/fitProbe); the key parts in view.
async function checkFit(page: Page, screen: keyof typeof SCREENS): Promise<void> {
  for (const { name, size } of SMALL) {
    for (const font of FONTS) {
      await atSize(page, size);
      await atFont(page, font);
      const what = `${screen} ${name} at ${String(font)} px`;
      const desktop = size.width >= 960;
      await settled(async () => {
        const p = await probe(page);
        expect(p.smallText, `${what}: text below 14 px`).toEqual([]);
        expect(p.smallCells, `${what}: card numbers below 16 px`).toEqual([]);
        expect(p.cut, `${what}: text cut`).toEqual([]);
        expect(p.overlaps, `${what}: text covered`).toEqual([]);
        expect(p.hScroll, `${what}: no sideways scroll`).toBe(false);
        if (!desktop && font !== 16) return;
        const report = await layoutReport(page, keysFor(screen, desktop));
        if (desktop) expectInWindow(report, what);
        else expectBoxesInWindow(report, what);
      });
    }
  }
  await atFont(page, 16);
}

// The watched cards' number grids line up in each row, also when one heading is long: the
// first card's name is set to 24 characters (the longest a name may be) for the measurement.
// Returns the rows whose grids start at different heights (empty when they line up).
const misalignedGridRows = (page: Page) =>
  page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll<HTMLElement>('[data-testid^="watch-card-"]'),
    ].filter((c) => c.checkVisibility());
    const name = cards[0]?.querySelector('.watch-head strong');
    const before = name?.textContent ?? '';
    if (name) name.textContent = '#1 a-very-long-name-24chr';
    const rows = new Map<number, number[]>();
    for (const card of cards) {
      const grid = card.querySelector(':scope > div > div');
      const top = Math.round(card.getBoundingClientRect().top);
      rows.set(top, [...(rows.get(top) ?? []), grid?.getBoundingClientRect().top ?? -1]);
    }
    if (name) name.textContent = before;
    return [...rows.values()]
      .filter((tops) => Math.max(...tops) - Math.min(...tops) > 1)
      .map((tops) => tops.map(Math.round));
  });

test('round screens on phones and at large fonts: in view, nothing small or cut', async ({
  browser,
}, info) => {
  // The rules are CSS: one engine measures them (WebKit runs the phone checks above).
  test.skip(info.project.name !== 'chromium', 'Chromium only');
  test.setTimeout(300_000);
  const host = await (await browser.newContext()).newPage();
  await signIn(host, 'host');
  const code = await hostMatch(host, {
    title: 'Fit check',
    gameType: 'royale',
    drawMode: 'host',
    missed: 'autoMarkAfter',
    maxPlayers: 11,
  });
  try {
    expect((await post(host, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
    await fillAndStart(host, 11);
    for (let i = 0; i < 3; i += 1) await drawNext(host);
    await checkFit(host, 'console');
    const player = await (await browser.newContext()).newPage();
    await signIn(player, 'host');
    await withEffects(player);
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('effect-growth')).toBeVisible({ timeout: 20_000 });
    await checkFit(player, 'player');
    const watcher = await (await browser.newContext()).newPage();
    await signIn(watcher, 'player-1');
    await watcher.goto(`/#/match/${code}`);
    await expect(watcher.getByTestId('watch-cards')).toBeVisible({ timeout: 20_000 });
    await checkFit(watcher, 'spectator');
    for (const { size } of SMALL.filter((x) => x.name !== '360x640')) {
      await atSize(watcher, size);
      await settled(async () => {
        expect(
          await misalignedGridRows(watcher),
          `${String(size.width)} px: grids in a row`,
        ).toEqual([]);
      });
    }
  } finally {
    await stopMatch(host, code);
  }
});
