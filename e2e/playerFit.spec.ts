/**
 * @file   e2e/playerFit.spec.ts
 * @module e2e
 * @brief  No page scroll during a round: player screen, spectator screen and host console.
 *
 * Responsibility: during a running round of a real match (host draws, the host playing along
 *                 with bots; royale with 11 and with 40 players, classic with 11) the page does
 *                 not scroll at 1280×720, 1366×768, 1536×730 and 1920×950: the ball, the drawn
 *                 numbers, the whole card (player) or the watched cards (spectator, D24), Draw
 *                 next (console) and the standings panel lie inside the window, the viewer's
 *                 own row visible in the standings and no two standings rows covering each other.
 *                 On a 390×844 phone the ball, the drawn
 *                 numbers and the card(s) are in view. Chromium saves the player screen at each
 *                 size in both themes (player-fit-*). The match is aborted afterwards, also on
 *                 failure.
 * Depends on:     @playwright/test, ./realGame, ./screens
 * Spec:           docs/spec/01-game-design.md §13
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  post,
  signIn,
  stopMatch,
} from './realGame.js';
import { captureThemes, SHOTS_DIR } from './screens.js';

const DESKTOPS = [
  { name: '1280x720', size: { width: 1280, height: 720 } },
  { name: '1366x768', size: { width: 1366, height: 768 } },
  { name: '1536x730', size: { width: 1536, height: 730 } },
  { name: '1920x950', size: { width: 1920, height: 950 } },
] as const;
const PHONE = { name: 'phone', size: { width: 390, height: 844 } } as const;

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// The element's box lies wholly inside the window (the page scrolled to the top).
async function expectInside(page: Page, what: string, el: Locator): Promise<void> {
  const box = await el.boundingBox();
  const view = page.viewportSize();
  expect(box, `${what} is on the page`).not.toBeNull();
  if (box === null || view === null) return;
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(0);
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(view.height + 0.5);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(view.width + 0.5);
}

async function expectNoPageScroll(page: Page, what: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.scrollingElement?.scrollHeight ?? 0,
    inner: window.innerHeight,
  }));
  expect(scroll, `${what}: page height within the window`).toBeLessThanOrEqual(inner);
}

async function atSize(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
}

// What each screen must show in one window; `own` is the viewer's standings row, if any.
const SCREENS = {
  player: (p: Page) => [
    ['ball', p.getByTestId('current-ball')],
    ['drawn numbers', p.getByTestId('draw-ticker')],
    ['card', p.locator('.live-card').first()],
    ['standings', p.getByTestId('standings-panel')],
    // The row in the list, or its copy below the list while the list has it out of view.
    ['own row', p.locator('[data-testid="standings-panel"] .rank-row.is-own').last()],
  ],
  spectator: (p: Page) => [
    ['ball', p.getByTestId('current-ball')],
    ['drawn numbers', p.getByTestId('draw-ticker')],
    ['watched cards', p.getByTestId('watch-cards')],
    ['standings', p.getByTestId('standings-panel')],
  ],
  console: (p: Page) => [
    ['ball', p.getByTestId('current-ball')],
    ['drawn numbers', p.getByTestId('draw-ticker')],
    ['Draw next', p.getByTestId('host-draw-next')],
    ['standings', p.getByTestId('standings-panel')],
  ],
} as const satisfies Record<string, (p: Page) => (readonly [string, Locator])[]>;

// No two standings rows cover each other where they are seen (each row clipped to the
// list it scrolls in): the viewer's own row never sits over another row.
async function expectRowsApart(page: Page, what: string): Promise<void> {
  const overlaps = await page.evaluate(() => {
    const seen = [...document.querySelectorAll('[data-testid="standings-panel"] .rank-row')]
      .map((row) => {
        const r = row.getBoundingClientRect();
        const box = (row.closest('ol') ?? row).getBoundingClientRect();
        const top = Math.max(r.top, box.top);
        const bottom = Math.min(r.bottom, box.bottom);
        return { name: row.getAttribute('data-testid') ?? '', top, bottom };
      })
      .filter((r) => r.bottom - r.top > 1);
    return seen.flatMap((a, i) =>
      seen
        .slice(i + 1)
        .filter((b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
        .map((b) => `${a.name} × ${b.name}`),
    );
  });
  expect(overlaps, `${what}: standings rows that cover each other`).toEqual([]);
}

async function checkDesktops(page: Page, screen: keyof typeof SCREENS, label: string) {
  for (const { name, size } of DESKTOPS) {
    await atSize(page, size);
    await expectNoPageScroll(page, `${label} ${screen} ${name}`);
    for (const [what, el] of SCREENS[screen](page)) {
      await expectInside(page, `${label} ${screen} ${name} ${what}`, el);
    }
    await expectRowsApart(page, `${label} ${screen} ${name}`);
  }
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
      await player.goto(`/#/match/${code}`);
      await expect(player.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
      await checkDesktops(player, 'player', label);
      const watcher = await (await browser.newContext()).newPage();
      await signIn(watcher, 'player-1');
      await watcher.goto(`/#/match/${code}`);
      await expect(watcher.getByTestId('watch-cards')).toBeVisible({ timeout: 20_000 });
      await checkDesktops(watcher, 'spectator', label);
      await atSize(player, PHONE.size);
      for (const [what, el] of SCREENS.player(player).slice(0, 3)) {
        await expectInside(player, `${label} player phone ${what}`, el);
      }
      await atSize(watcher, PHONE.size);
      for (const [what, el] of SCREENS.spectator(watcher).slice(0, 3)) {
        await expectInside(watcher, `${label} spectator phone ${what}`, el);
      }
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
