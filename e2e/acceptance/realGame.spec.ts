/**
 * @file   e2e/acceptance/realGame.spec.ts
 * @module e2e/acceptance
 * @brief  Acceptance play-through of the real game: host and three players, every game type.
 *
 * Responsibility: four browser contexts — the host and players 1–2 at 1280×800, player 3
 *                 at phone size 390×844 — signed in with the quick sign-in, play every match
 *                 of ./combos: the host creates it (after checking the D12 message in the
 *                 form), the players join, bots fill it to 20, the host starts and it plays to
 *                 the end. Players tap, tap late and miss; on every draw every screen shows
 *                 the host's number, each player's points equal their standings row, no mark
 *                 sits on an undrawn number, the missed-number rule holds, the cut screen's
 *                 button fits the outcome (D15); host draws count down to their unlock (D13);
 *                 the live seconds field refuses a too-short interval (D12); with "host
 *                 starts the next round" nothing starts until the host does (D14). At the
 *                 end every cut matches server points and each rank equals the final place;
 *                 then one more match right away must start fresh. Every match the test
 *                 created is stopped in teardown. Screenshots of royale with host draws and
 *                 classic with seasons (mid-match, cut, pause, end; light and dark) go to
 *                 reports/screens/look/. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../realGame, ../devStack, ../screens, ./combos, ./liveSnap,
 *                 ./livePlayer, ./cuts, ./ownerRules
 * Spec:           docs/spec/12-testing-strategy.md §4, §8; docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import path from 'node:path';

import { expect, test, type Browser, type Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import {
  currentItem,
  drawNext,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
  stopMatch,
} from '../realGame.js';
import { COMBOS, title, type Combo } from './combos.js';
import { checkCuts, type ServerResult } from './cuts.js';
import { handlePending, newPlayer, onNewDraw, type LivePlayer } from './livePlayer.js';
import { checkPlayer, liveSnap } from './liveSnap.js';
import { captureThemes, DESKTOP, PHONE } from '../screens.js';
import {
  checkCutButton,
  checkDrawCountdown,
  checkShortestIntervalForm,
  checkShortestIntervalLive,
  startNextRoundByHost,
  waitingForHost,
} from './ownerRules.js';

const SHOTS_DIR = path.join(REPO_ROOT, 'reports', 'screens', 'look');

interface Table {
  readonly host: Page;
  readonly players: readonly LivePlayer[];
}

async function seat(browser: Browser, combo: Combo): Promise<Table> {
  const open = async (who: 'host' | 'player-1' | 'player-2' | 'player-3', phone = false) => {
    const ctx = await browser.newContext({ viewport: phone ? PHONE : DESKTOP });
    const page = await ctx.newPage();
    await signIn(page, who);
    return page;
  };
  const host = await open('host');
  const pages = [await open('player-1'), await open('player-2'), await open('player-3', true)];
  return {
    host,
    players: pages.map((p, i) => newPlayer(p, `player-${String(i + 1)}`, combo.missed)),
  };
}

// The look shots, light and dark (royale with host draws holds every moment; classic with
// seasons adds its prize list).
const SHOOTS: readonly string[] = ['royale-host', 'classicSeasons-timed'];

async function shoot(t: Table, combo: Combo, moment: string): Promise<void> {
  if (!SHOOTS.includes(combo.name)) return;
  const pages: [string, Page][] = [
    ['host', t.host],
    ...t.players.map((p): [string, Page] => [p.who, p.page]),
  ];
  for (const [who, page] of pages) {
    await captureThemes(page, SHOTS_DIR, `${combo.name}-${moment}-${who}`);
  }
}

async function startMatch(
  t: Table,
  combo: Combo,
  title: string,
  created: string[],
): Promise<string> {
  await checkShortestIntervalForm(t.host);
  const code = await hostMatch(t.host, { ...combo, title });
  created.push(code);
  for (const p of t.players) await joinFromLobby(p.page, code);
  await t.host.goto(`/#/host/${code}`);
  await fillAndStart(t.host, 20);
  for (const p of t.players)
    await expect(p.page.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
  return code;
}

// After a draw: every screen shows the host's number; every player screen is consistent.
async function afterDraw(t: Table): Promise<boolean> {
  const hostItem = await currentItem(t.host);
  let cut = false;
  for (const p of t.players) {
    // The host's number is on the screen: as the current ball, or already in the strip
    // when the next timed draw came while earlier players were being checked. Between
    // rounds the host shows no number yet; then neither may the player.
    await expect
      .poll(
        async () =>
          hostItem === null
            ? (await currentItem(p.page)) === null
            : (await liveSnap(p.page)).ticker.includes(hostItem),
        { timeout: 5_000 },
      )
      .toBe(true);
    const s = await liveSnap(p.page);
    checkPlayer(s, p.who);
    await handlePending(p, s);
    await onNewDraw(p, s);
    await checkCutButton(p);
    cut ||= s.cutShown;
  }
  return cut;
}

async function waitTimedDraw(host: Page, before: number): Promise<void> {
  const count = () => host.getByTestId('draw-ticker').locator(':scope > *').count();
  await expect
    .poll(async () => (await count()) !== before || (await isOver(host)), { timeout: 15_000 })
    .toBe(true);
}

const isOver = async (host: Page) =>
  (await host.getByTestId('host-status').getAttribute('data-status')) !== 'running';

async function playToEnd(t: Table, combo: Combo): Promise<number> {
  let draws = 0;
  let cutShot = false;
  let pauseShot = false;
  let mode = combo.drawMode;
  while (!(await isOver(t.host))) {
    if (await waitingForHost(t.host)) {
      await startNextRoundByHost(t.host, t.players, async () => {
        if (!pauseShot) await shoot(t, combo, 'pause');
        pauseShot = true;
      });
      continue;
    }
    if (combo.switches && draws === 20) mode = await setMode(t.host, 'host');
    if (combo.switches && draws === 24) {
      mode = await setMode(t.host, 'auto');
      await checkShortestIntervalLive(t.host);
    }
    if (mode === 'host') await hostDraw(t.host);
    else
      await waitTimedDraw(
        t.host,
        await t.host.getByTestId('draw-ticker').locator(':scope > *').count(),
      );
    if (await isOver(t.host)) break;
    draws += 1;
    const cut = await afterDraw(t);
    if (draws === 30) await shoot(t, combo, 'mid');
    if (cut && !cutShot) {
      cutShot = true;
      await shoot(t, combo, 'cut');
    }
  }
  return draws;
}

// A host draw; right after it Draw next counts down to its unlock (D13).
async function hostDraw(host: Page): Promise<void> {
  const drawn = await drawNext(host).then(
    () => true,
    () => false,
  );
  const roundOver = await host.getByText('Round over').count();
  if (drawn && roundOver === 0 && !(await isOver(host))) await checkDrawCountdown(host);
}

async function setMode(host: Page, mode: 'auto' | 'host'): Promise<'auto' | 'host'> {
  await host.getByTestId(mode === 'host' ? 'host-mode-host' : 'host-mode-timed').click();
  await expect(
    host.getByTestId(mode === 'host' ? 'host-mode-host' : 'host-mode-timed'),
  ).toHaveAttribute('aria-pressed', 'true');
  return mode;
}

interface StateBody {
  readonly me: string | null;
  readonly view: ServerResult & {
    readonly players: readonly { readonly accountId: string; readonly place: number }[];
  };
}

// At the end: cuts against server points; each player's rank equals the final place.
async function checkEnd(t: Table, code: string): Promise<{ cuts: number; ties: number }> {
  let cuts = { cuts: 0, ties: 0 };
  for (const p of t.players) {
    await expect(p.page.getByTestId('final-placement')).toBeVisible({ timeout: 15_000 });
    const body = (await (
      await p.page.request.get(`/api/v1/matches/${code}/state`)
    ).json()) as StateBody;
    cuts = checkCuts(body.view);
    const place = body.view.players.find((x) => x.accountId === body.me)?.place;
    const s = await liveSnap(p.page);
    expect(s.rank, `${p.who}: rank = final place`).toBe(place);
    checkPlayer(s, p.who);
  }
  return cuts;
}

// One more match right away: nothing of the last one may show.
async function checkFreshStart(t: Table, combo: Combo, created: string[]): Promise<void> {
  const code = await startMatch(t, combo, `${title(combo)}, again`, created);
  for (const p of t.players) {
    const s = await liveSnap(p.page);
    expect(
      s.cells.filter((c) => c.marked).map((c) => c.value),
      `${p.who}: fresh card`,
    ).toEqual([null]);
    expect(s.points, `${p.who}: fresh points`).toBe(0);
    expect(s.cutShown, `${p.who}: no cut screen`).toBe(false);
    expect(s.finished).toBe(false);
  }
  await t.host.getByTestId('abort-reason').fill('fresh-state check done');
  await t.host.getByTestId('abort-match').click();
  await expect(t.host.getByTestId('host-status')).toHaveAttribute('data-status', 'aborted');
  expect(code).not.toBe('');
}

for (const combo of COMBOS) {
  test(`real game: ${combo.name}${combo.switches ? ' (switches draws mid-match)' : ''}`, async ({
    browser,
  }) => {
    test.setTimeout(45 * 60_000);
    const t = await seat(browser, combo);
    const created: string[] = [];
    try {
      const code = await startMatch(t, combo, title(combo), created);
      const draws = await playToEnd(t, combo);
      const cuts = await checkEnd(t, code);
      await shoot(t, combo, 'end');
      await checkFreshStart(t, combo, created);
      const misses = t.players.flatMap((p) => p.missTimings);
      console.log(`REAL ${combo.name} ${JSON.stringify({ code, draws, cuts, misses })}`);
    } finally {
      // Every match this test created is stopped, also when a step above failed.
      for (const code of created) await stopMatch(t.host, code);
    }
  });
}
