/**
 * @file   e2e/acceptance/acceptance.spec.ts
 * @module e2e/acceptance
 * @brief  Acceptance play-through: every game type × marking × missed numbers × draws.
 *
 * Responsibility: for every combination play one complete match with 20 bots and one
 *                 owner card on a fixed seed, checking the whole screen after every draw
 *                 (./checks) and every cut against server points (./cuts); one royale and
 *                 one classic run switch between timed and host draws mid-match. After
 *                 each match, Run Quick Test again with another seed: nothing of the last
 *                 run may remain, then a few draws are played. A full-page screenshot of
 *                 each match end and each restart goes to reports/screens/acceptance/.
 *                 Runs only with SBR_ACCEPTANCE=1 (about half an hour), not in CI.
 * Depends on:     @playwright/test, ../quickTest, ../devStack, ./checks, ./cuts, ./play,
 *                 ./snapshot
 * Spec:           docs/spec/01-game-design.md §3a, §5–§8, §13; docs/spec/12-testing-strategy.md §8
 */
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { REPO_ROOT } from '../devStack.js';
import { startRun, type RunSettings } from '../quickTest.js';
import { checkFresh, newContext, type GameType, type RunContext } from './checks.js';
import { checkCuts, type ServerResult } from './cuts.js';
import { play } from './play.js';
import { snapshot } from './snapshot.js';

interface Combo {
  readonly gameType: GameType;
  readonly marking: 'tap' | 'markforme';
  readonly missed: 'after3' | 'open' | 'na';
  readonly draws: 'timed' | 'host';
}

const GAME_TYPES: readonly GameType[] = ['royale', 'classicSeasons', 'classic'];
const TIMED_SEC = 2; // the fastest allowed timed draws keep a royale near seven minutes
const SCREENS = path.join(REPO_ROOT, 'reports', 'screens', 'acceptance');

function combos(): Combo[] {
  const list: Combo[] = [];
  for (const gameType of GAME_TYPES) {
    for (const draws of ['timed', 'host'] as const) {
      list.push({ gameType, marking: 'tap', missed: 'after3', draws });
      list.push({ gameType, marking: 'tap', missed: 'open', draws });
      list.push({ gameType, marking: 'markforme', missed: 'na', draws });
    }
  }
  return list;
}

const nameOf = (c: Combo): string => `${c.gameType}-${c.marking}-${c.missed}-${c.draws}`;

function settingsOf(c: Combo, seed: string): RunSettings {
  return {
    gameType: c.gameType,
    seed,
    bots: 20,
    marking: c.marking === 'tap' ? 'manual' : 'auto',
    missed: c.missed === 'open' ? 'noAutoMark' : 'autoMarkAfter',
    drawMode: c.draws === 'timed' ? 'auto' : 'host',
    intervalSec: TIMED_SEC,
  };
}

function contextOf(c: Combo): RunContext {
  const missed =
    c.marking === 'tap' ? (c.missed === 'open' ? 'noAutoMark' : 'autoMarkAfter') : null;
  return newContext(c.gameType, c.marking === 'tap', missed);
}

// Starts a run (fresh page or Run Quick Test again) and returns the server's result.
async function run(page: Page, start: () => Promise<void>): Promise<ServerResult> {
  const response = page.waitForResponse((r) => r.url().endsWith('/dev/quicktest'));
  await start();
  const result = (await (await response).json()) as ServerResult;
  await expect(page.getByTestId('draw-ticker').locator(':scope > *')).toHaveCount(0);
  return result;
}

for (const combo of combos()) {
  // One royale and one classic run switch draw control mid-match.
  const switches =
    combo.draws === 'timed' &&
    combo.marking === 'tap' &&
    combo.missed === 'after3' &&
    (combo.gameType === 'royale' || combo.gameType === 'classic');
  test(`acceptance: ${nameOf(combo)}${switches ? ' (switches draws mid-match)' : ''}`, async ({
    page,
  }) => {
    test.setTimeout(25 * 60_000);
    const seed = `acc-${nameOf(combo)}`;
    const ctx = contextOf(combo);
    const result = await run(page, () => startRun(page, settingsOf(combo, seed)));
    const cuts = checkCuts(result);
    if (combo.gameType === 'royale') expect(cuts.cuts).toBeGreaterThan(0);
    const end = await play(page, ctx, {
      mode: combo.draws === 'timed' ? 'auto' : 'host',
      ...(switches ? { switchAt: 20 } : {}),
    });
    expect(end.finished).toBe(true);
    await page.screenshot({ path: path.join(SCREENS, `${nameOf(combo)}.png`), fullPage: true });

    // Run Quick Test again with another seed: a fresh match, then a few draws.
    const again = contextOf(combo);
    await run(page, async () => {
      await page.getByTestId('seed').fill(`${seed}-again`);
      await page.getByTestId('start-run').click();
    });
    checkFresh(await snapshot(page), again);
    await play(page, again, { mode: combo.draws === 'timed' ? 'auto' : 'host', maxDraws: 4 });
    await page.screenshot({
      path: path.join(SCREENS, `${nameOf(combo)}-restart.png`),
      fullPage: true,
    });
    // Evidence for the sheet: cuts checked, ties on points, ms from draw to auto-mark.
    console.log(
      `ACCEPTANCE ${nameOf(combo)} ${JSON.stringify({ cuts, misses: ctx.missTimings, hits: ctx.ownerHits })}`,
    );
  });
}
