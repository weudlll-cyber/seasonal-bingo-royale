/**
 * @file   e2e/acceptance/realGame.spec.ts
 * @module e2e/acceptance
 * @brief  Acceptance play-through of the real game: host and three players, every game type.
 *
 * Responsibility: four browser contexts — the host and players 1–2 at 1280×800, player 3
 *                 at phone size 390×844 — signed in with the quick sign-in, play every match
 *                 of ./combos: the host creates it (after checking the D12 message in the
 *                 form), the players join, bots fill it to 20, the host starts and it plays to
 *                 the end. Players tap, tap late and miss; on every draw every screen's numbers
 *                 are the start of the server's round (also across round changes), each
 *                 player's points equal their standings row and the server's points, no mark
 *                 sits on an undrawn number, the missed-number rule holds, the cut screen's
 *                 button fits the outcome (D15); host draws count down to their unlock (D13);
 *                 the live seconds field refuses a too-short interval (D12); with "host
 *                 starts the next round" nothing starts until the host does (D14). At the
 *                 end every cut matches server points, each rank equals the final place and
 *                 each player's points the server's; a failed Draw next fails the test;
 *                 then one more match right away must start fresh. Every match the test
 *                 created is stopped in teardown. Screenshots of royale with host draws and
 *                 classic with seasons (mid-match, cut, pause, end; light and dark) go to
 *                 reports/screens/latest/. Runs only with SBR_ACCEPTANCE=1.
 * Depends on:     @playwright/test, ../realGame, ../screens, ./combos, ./liveSnap,
 *                 ./livePlayer, ./cuts, ./ownerRules, ./serverView
 * Spec:           docs/spec/12-testing-strategy.md §4, §8; docs/spec/15-implementation-plan.md WP-12, WP-13
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

import {
  closeContexts,
  drawNext,
  fillAndStart,
  hostMatch,
  joinFromLobby,
  signIn,
  stopMatch,
} from '../realGame.js';
import { COMBOS, FIELD, title, type Combo } from './combos.js';
import { checkCuts, type ServerResult } from './cuts.js';
import { handlePending, newPlayer, onNewDraw, type LivePlayer } from './livePlayer.js';
import { checkPlayer, liveSnap, type LiveSnap } from './liveSnap.js';
import { captureThemes, DESKTOP, PHONE, SHOTS_DIR } from '../screens.js';
import {
  checkCutButton,
  checkDrawCountdown,
  checkShortestIntervalForm,
  checkShortestIntervalLive,
  startNextRoundByHost,
  waitingForHost,
} from './ownerRules.js';
import { matchesServer, serverView, type ServerView } from './serverView.js';

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
  await fillAndStart(t.host, FIELD);
  for (const p of t.players)
    await expect(p.page.getByTestId('arena')).toBeVisible({ timeout: 20_000 });
  return code;
}

const seqOf = async (page: Page, testId: string): Promise<number> =>
  Number(await page.getByTestId(testId).getAttribute('data-seq'));

// After a draw: every screen's numbers are the server's, by the server's event log (every
// draw, also across round changes); a player's points are the server's when the screen and
// the server are at the same event.
async function afterDraw(t: Table, code: string, hostSawAt: number): Promise<boolean> {
  const hostSeq = await seqOf(t.host, 'host-console');
  await checkAgainstServer(t.host, 'host', code, await liveSnap(t.host));
  let cut = false;
  for (const p of t.players) {
    await expect
      .poll(() => seqOf(p.page, 'arena'), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(hostSeq);
    const seq = await seqOf(p.page, 'arena');
    const s = await liveSnap(p.page);
    const view = await checkAgainstServer(p.page, p.who, code, s);
    if (view.seq === seq && view.points !== null && !s.finished) {
      expect(s.points, `${p.who}: points = the server's`).toBe(view.points);
    }
    checkPlayer(s, p.who);
    await handlePending(p, s);
    await onNewDraw(p, s, view.rounds.length - 1, hostSawAt);
    await checkCutButton(p);
    cut ||= s.cutShown;
  }
  return cut;
}

// The screen's numbers are the start of the server's round (read after the screen).
async function checkAgainstServer(page: Page, who: string, code: string, s: LiveSnap) {
  const view = await serverView(page, code);
  expect(matchesServer(s.ticker, view), `${who}: ${JSON.stringify(s.ticker)} vs server`).toBe(true);
  return view;
}

// Both waits answer when the host's screen showed the draw (polled every 100 ms).
async function waitTimedDraw(host: Page, before: number): Promise<number> {
  const count = () => host.getByTestId('draw-ticker').locator(':scope > *').count();
  await expect
    .poll(async () => (await count()) !== before || (await isOver(host)), {
      timeout: 15_000,
      intervals: [100],
    })
    .toBe(true);
  return Date.now();
}

const isOver = async (host: Page) =>
  (await host.getByTestId('host-status').getAttribute('data-status')) !== 'running';

async function playToEnd(t: Table, combo: Combo, code: string): Promise<number> {
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
    const hostSawAt =
      mode === 'host'
        ? await hostDraw(t.host)
        : await waitTimedDraw(
            t.host,
            await t.host.getByTestId('draw-ticker').locator(':scope > *').count(),
          );
    if (await isOver(t.host)) break;
    draws += 1;
    const cut = await afterDraw(t, code, hostSawAt);
    if (draws === 8) await shoot(t, combo, 'mid');
    if (cut && !cutShot) {
      cutShot = true;
      await shoot(t, combo, 'cut');
    }
  }
  return draws;
}

// A host draw; right after it Draw next counts down to its unlock (D13). A failed draw fails
// the test, unless the round or the match ended or the match waits for its host meanwhile.
async function hostDraw(host: Page): Promise<number> {
  const failure = await drawNext(host).then(
    () => null,
    (error: unknown) => error,
  );
  const sawAt = Date.now();
  const roundOver = (await host.getByText('Round over').count()) > 0;
  const ended = roundOver || (await isOver(host)) || (await waitingForHost(host));
  if (failure !== null && !ended) {
    throw failure instanceof Error ? failure : new Error('Draw next failed');
  }
  if (failure === null && !ended) await checkDrawCountdown(host);
  return sawAt;
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
    readonly players: readonly {
      readonly accountId: string;
      readonly place: number;
      readonly points: number;
    }[];
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
    const own = body.view.players.find((x) => x.accountId === body.me);
    const s = await liveSnap(p.page);
    expect(s.rank, `${p.who}: rank = final place`).toBe(own?.place);
    expect(s.points, `${p.who}: final points = the server's`).toBe(own?.points);
    checkPlayer(s, p.who);
  }
  return cuts;
}

// Inside taps on a round's last number (D10); each was asserted marked when it happened.
// Server seeds are random, so how many there are differs from run to run.
function lastTaps(t: Table, view: ServerView): number {
  return t.players
    .flatMap((p) => p.insideTaps)
    .filter((tap) => view.rounds[tap.round]?.at(-1) === tap.value).length;
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

// The six matches run side by side (three workers): separate contexts and matches.
// Contexts this spec opens are closed after every test (see closeContexts).
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test.describe.configure({ mode: 'parallel' });

for (const combo of COMBOS) {
  test(`real game: ${combo.name}${combo.switches ? ' (switches draws mid-match)' : ''}`, async ({
    browser,
  }) => {
    test.setTimeout(45 * 60_000);
    const t = await seat(browser, combo);
    const created: string[] = [];
    try {
      const code = await startMatch(t, combo, title(combo), created);
      const draws = await playToEnd(t, combo, code);
      const cuts = await checkEnd(t, code);
      await shoot(t, combo, 'end');
      await checkFreshStart(t, combo, created);
      const misses = t.players.flatMap((p) => p.missTimings);
      const lastNumberTaps = lastTaps(t, await serverView(t.host, code));
      console.log(
        `REAL ${combo.name} ${JSON.stringify({ code, draws, cuts, misses, lastNumberTaps })}`,
      );
    } finally {
      // Every match this test created is stopped, also when a step above failed.
      for (const code of created) await stopMatch(t.host, code);
    }
  });
}
