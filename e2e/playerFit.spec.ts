/**
 * @file   e2e/playerFit.spec.ts
 * @module e2e
 * @brief  No page scroll during a round: player screen, spectator screen and host console.
 *
 * Responsibility: in a running round of a real match (host draws, the host playing along; royale
 *                 with 11 and 40 players, classic with 11), at 1280×720 up to 1920×950 (1890×850
 *                 included): no page scroll, the key elements in the window, standings rows apart,
 *                 the ball's text inside it, the side column not scrolling itself with the top 3
 *                 and the own row whole (royale player: two effects, a shield and two seasons
 *                 filled in by the spec); on a phone the ball, numbers and card(s) in view. One
 *                 measurement per screen and size (WebKit round trips are slow). Chromium saves
 *                 player-fit-*. The match is aborted afterwards, also on failure.
 * Depends on:     @playwright/test, ./realGame, ./layoutChecks, ./screens
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
// active, a Winter shield charge and two seasons collected: the fullest side column.
async function withEffects(page: Page): Promise<void> {
  await page.route('**/api/v1/matches/*/state*', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      view: {
        events: unknown[];
        players?: { accountId: string; isOwner: boolean }[];
        ownerStatus: Record<string, unknown[]>;
      };
    };
    const { view } = body;
    for (const owner of (view.players ?? []).filter((p) => p.isOwner)) {
      const list = view.ownerStatus[owner.accountId] ?? [];
      view.ownerStatus[owner.accountId] = [
        ...list,
        {
          step: view.events.length,
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
