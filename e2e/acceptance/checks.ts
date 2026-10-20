/**
 * @file   e2e/acceptance/checks.ts
 * @module e2e/acceptance
 * @brief  Consistency of everything on screen after each draw, and of a fresh run.
 *
 * Responsibility: the screen-wide rules of the acceptance play-through: the owner's
 *                 points above the card equal the standings; standings are not all zero
 *                 after the first round; in royale the seasons counter equals the server's
 *                 seasons in the standings (and, when marked for the owner, the marked
 *                 season cells), in the classic types no seasons or
 *                 shield panel shows; no marked cell on an undrawn number; each tick
 *                 shows exactly one new number; the owner's rank equals the final place
 *                 at the end; after a restart nothing of the previous run remains.
 * Depends on:     @playwright/test, ./snapshot
 * Used by:        ./play.ts, ./acceptance.spec.ts
 * Spec:           docs/spec/01-game-design.md §5–§8, §13; docs/spec/12-testing-strategy.md §8
 */
import { expect } from '@playwright/test';

import { tickKey, type Snap } from './snapshot.js';

export type GameType = 'royale' | 'classicSeasons' | 'classic';

export interface RunContext {
  readonly gameType: GameType;
  readonly tapping: boolean;
  readonly missed: 'autoMarkAfter' | 'noAutoMark' | null;
  readonly delayMs: number;
  // Seasons of the owner's marked season cells seen so far in this run (01 §8.3).
  readonly seasons: Set<string>;
  ownerHits: number; // owner numbers drawn so far, to rotate tap / late / miss
  // Per round: how many draws it has (from the server result), to find its last number.
  readonly lastDraws: Map<number, number>;
  lastNumberTaps: number; // last numbers of a round tapped inside their window (D10)
  readonly missTimings: number[]; // ms from draw to "marked for you", per missed number
}

export function newContext(
  gameType: GameType,
  tapping: boolean,
  missed: RunContext['missed'],
): RunContext {
  return {
    gameType,
    tapping,
    missed,
    delayMs: 3_000,
    seasons: new Set(),
    ownerHits: 0,
    lastDraws: new Map(),
    lastNumberTaps: 0,
    missTimings: [],
  };
}

export function checkScreen(s: Snap, prev: Snap | null, ctx: RunContext): void {
  checkPoints(s);
  checkSeasons(s, ctx);
  for (const c of s.cells) {
    if (c.marked && c.value !== null) {
      expect(s.ticker, `marked cell ${String(c.value)} was drawn`).toContain(c.value);
    }
  }
  expect(s.draws, 'header draw count = ticker').toBe(s.ticker.length);
  if (prev !== null && tickKey(prev) !== tickKey(s)) checkOneNewNumber(s, prev);
  if (s.finished) expect(s.ownerRank, 'rank above the card = final place').toBe(s.finalOwnerPlace);
}

function checkPoints(s: Snap): void {
  const row = s.standings.find((r) => r.id === 'owner-01');
  expect(row, 'owner in the standings').toBeDefined();
  expect(s.ownerPoints, 'points above the card = standings').toBe(row?.points);
  if (s.round >= 1 || s.finished) {
    expect(
      s.standings.some((r) => r.points > 0),
      'standings not all zero',
    ).toBe(true);
  }
}

function checkSeasons(s: Snap, ctx: RunContext): void {
  if (ctx.gameType !== 'royale') {
    expect(s.seasonsCount, 'no seasons panel in classic types').toBeNull();
    expect(s.shieldShown, 'no shield in classic types').toBe(false);
    return;
  }
  // The counter comes from the server: it equals the owner's seasons in the standings.
  const own = s.standings.find((r) => r.id === 'owner-01');
  expect(s.seasonsCount, 'seasons counter = server seasons').toBe(own?.seasons);
  if (ctx.tapping) return;
  // Marked for the owner, the card shows the server's marks: the counter matches them.
  for (const c of s.cells) if (c.marked && c.season !== '') ctx.seasons.add(c.season);
  expect(
    s.seasonsCount,
    `seasons counter = marked season cells ${[...ctx.seasons].join(',')}`,
  ).toBe(ctx.seasons.size);
}

// One tick: the next number of the same round, or the first number of a new round.
function checkOneNewNumber(s: Snap, prev: Snap): void {
  if (s.round === prev.round) {
    expect(s.ticker.length, 'exactly one new number').toBe(prev.ticker.length + 1);
    expect(s.ticker.slice(0, -1), 'earlier numbers unchanged').toEqual(prev.ticker);
  } else {
    expect(s.ticker.length, 'a new round shows its first number').toBe(1);
  }
}

// Right after Run Quick Test, before the first draw of the new run.
export function checkFresh(s: Snap, ctx: RunContext): void {
  expect(s.ticker, 'no number drawn yet').toEqual([]);
  expect(
    s.cells.filter((c) => c.marked).map((c) => c.value),
    'only the free centre is marked',
  ).toEqual([null]);
  expect(
    s.standings.every((r) => r.points === 0 && !r.eliminated),
    'standings reset',
  ).toBe(true);
  expect(s.ownerPoints).toBe(0);
  if (ctx.gameType === 'royale') expect(s.seasonsCount, 'seasons counter reset').toBe(0);
  expect(s.cutShown, 'no cut screen').toBe(false);
  expect(s.logEntries, 'empty match log').toBe(0);
  expect(s.finished, 'no final placement').toBe(false);
  if (ctx.tapping) {
    expect(s.bonus).toBe('+0 speed bonus (not counted in Quick Test cuts)');
    expect(s.feedback).toBe('Tap a drawn number on your card.');
  }
}
