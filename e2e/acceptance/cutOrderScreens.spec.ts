/**
 * @file   e2e/acceptance/cutOrderScreens.spec.ts
 * @module e2e/acceptance
 * @brief  Players out in one cut: the live order and the own rank equal the final placement.
 *
 * Responsibility: the host plays a royale at the standard rules with 7 bots, tapping only
 *                 now and then so they fall out early; after every cut the live standings'
 *                 order of the players that cut put out is taken, and the host's "rank #N"
 *                 once they are out; at the end both are compared with the server's final
 *                 placement. Two screenshots for the owner: cut-order-during.jpg (the first
 *                 view with the host out) and cut-order-end.jpg. The match is aborted if it
 *                 is still running at the end (test cleanup). No trace: the run is long.
 * Depends on:     @playwright/test, ../realGame, ../screens, ./liveSnap, ./screenPlay,
 *                 ./snapshot
 * Spec:           docs/spec/01-game-design.md §7.4, §8.4, §13; docs/spec/12-testing-strategy.md §4
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { fillAndStart, hostMatch, post, signIn, stopMatch } from '../realGame.js';
import { SHOTS_DIR } from '../screens.js';
import { liveSnap } from './liveSnap.js';
import { SIZES, tapCurrent, until } from './screenPlay.js';
import { snapshot } from './snapshot.js';

test.use({ trace: 'off' });

interface Seen {
  // The players each cut put out, in the live standings' order.
  readonly cuts: string[][];
  // The host's live rank in the first view with the host out, and in which cut.
  ownRank: number | null;
  ownCut: number | null;
}

interface StateBody {
  readonly me: string | null;
  readonly view: { readonly players: readonly { accountId: string; place: number }[] };
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(SHOTS_DIR, `${name}.jpg`), type: 'jpeg', quality: 80 });

// Plays to the end, tapping every 8th number; notes each cut's live order of those out.
async function playThrough(page: Page): Promise<Seen> {
  const seen: Seen = { cuts: [], ownRank: null, ownCut: null };
  const known = new Set<string>();
  let item: number | null = null;
  let draws = 0;
  const step = async (): Promise<void> => {
    const s = await snapshot(page);
    if (s.finished) return;
    const fresh = s.standings.filter((p) => p.eliminated && !known.has(p.id)).map((p) => p.id);
    if (fresh.length > 0) {
      fresh.forEach((id) => known.add(id));
      seen.cuts.push(fresh);
    }
    if (s.ownerOut !== null && seen.ownRank === null) {
      seen.ownRank = s.ownerRank;
      seen.ownCut = seen.cuts.length;
      await shot(page, 'cut-order-during');
    }
    const now = (await liveSnap(page)).item;
    if (now !== null && now !== item) {
      item = now;
      draws += 1;
      if (draws % 8 === 0) await tapCurrent(page);
    }
  };
  await until(page, page.getByTestId('result'), step, 75);
  return seen;
}

test('players out in a cut: live order and own rank equal the final placement', async ({
  browser,
}) => {
  test.setTimeout(85 * 60_000);
  const page = await (await browser.newContext({ viewport: SIZES[0].size })).newPage();
  await signIn(page, 'host');
  const code = await hostMatch(page, {
    title: 'Cut order',
    gameType: 'royale',
    drawMode: 'auto',
    missed: 'autoMarkAfter',
    maxPlayers: 8,
  });
  try {
    expect((await post(page, `/api/v1/matches/${code}/join`, {})).status()).toBe(204);
    await fillAndStart(page, 8);
    const player = await page.context().newPage();
    await player.goto(`/#/match/${code}`);
    await expect(player.getByTestId('arena')).toBeVisible({ timeout: 60_000 });
    const seen = await playThrough(player);
    await shot(player, 'cut-order-end');
    const body = (await (
      await player.request.get(`/api/v1/matches/${code}/state`)
    ).json()) as StateBody;
    const place = new Map(body.view.players.map((p) => [p.accountId, p.place]));
    const byPlace = (ids: readonly string[]) =>
      [...ids].sort((a, b) => (place.get(a) ?? 0) - (place.get(b) ?? 0));
    seen.cuts.forEach((ids, i) => {
      const final = ids.map((id) => `${id} #${String(place.get(id))}`).join(', ');
      console.log(`cut ${String(i + 1)} out, live order: ${final}`);
    });
    const own = place.get(body.me ?? '');
    console.log(
      `host out in cut ${String(seen.ownCut)}: live #${String(seen.ownRank)}, final #${String(own)}`,
    );
    for (const ids of seen.cuts) expect(ids, 'live order of a cut = final').toEqual(byPlace(ids));
    expect(seen.ownCut, 'the host fell out in a cut').not.toBeNull();
    expect(seen.ownRank, 'the live rank = the final place').toBe(own);
  } finally {
    await stopMatch(page, code);
  }
});
