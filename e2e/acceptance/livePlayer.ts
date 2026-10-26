/**
 * @file   e2e/acceptance/livePlayer.ts
 * @module e2e/acceptance
 * @brief  A player in the real-game play-through: taps inside the window, late, or misses.
 *
 * Responsibility: each number drawn on the player's card is in turn tapped at once (inside
 *                 the speed window), tapped late, or missed on purpose. A late tap under
 *                 "leave open" comes after the window, under "mark after 3 s" at 2 s; either
 *                 way it must mark (only a round that ended meanwhile excuses it). A missed
 *                 number must stay open under "leave open" for as long as its round runs;
 *                 under "mark after 3 s" it is marked for the player, not before about 3 s
 *                 (watched from the draw on, not only at the next draw) and within a few
 *                 seconds. The server decides every mark; the screen shows
 *                 the server's marks.
 * Depends on:     @playwright/test, ./liveSnap
 * Used by:        ./realGame.spec.ts, ./ownerRules
 * Spec:           docs/spec/01-game-design.md §6 (D9, D10)
 */
import { expect, type Page } from '@playwright/test';

import type { LiveSnap } from './liveSnap.js';

type Plan = 'inside' | 'late' | 'miss';
const PLANS: readonly Plan[] = ['inside', 'late', 'miss'];

interface Pending {
  readonly testId: string;
  readonly value: number;
  readonly drawnAt: number;
  readonly plan: 'late' | 'miss';
  done: boolean;
  // A miss under "mark after 3 s": how long after the draw the screen showed it marked,
  // if that happened within the first moments (watched right away, ./watchEarly).
  readonly early?: Promise<number | null>;
}

export interface LivePlayer {
  readonly page: Page;
  readonly who: string;
  readonly missed: 'autoMarkAfter' | 'noAutoMark';
  hits: number;
  pending: Pending[];
  readonly missTimings: number[];
  // Numbers tapped inside their window, with the round (index in the server's log); a
  // round's last number among them is a D10 tap.
  readonly insideTaps: { readonly value: number; readonly round: number }[];
  // The draw already planned (ticker length and number): a later check of the same draw,
  // e.g. while the match waits for its host after a cut, must not tap it again.
  lastDraw: string | null;
}

export function newPlayer(page: Page, who: string, missed: LivePlayer['missed']): LivePlayer {
  return {
    page,
    who,
    missed,
    hits: 0,
    pending: [],
    missTimings: [],
    insideTaps: [],
    lastDraw: null,
  };
}

// A new number is on screen: plan what this player does with it, if it is on the card
// (once per draw). `round` is the round's index in the server's log; `hostSawAt` is when
// the host's screen first showed the draw (the players' screens are read one after the
// other, so a player's own read can come seconds after the draw).
export async function onNewDraw(
  p: LivePlayer,
  s: LiveSnap,
  round: number,
  hostSawAt: number,
): Promise<void> {
  const draw = `${String(s.ticker.length)}:${String(s.item)}`;
  if (draw === p.lastDraw) return;
  p.lastDraw = draw;
  const cell = s.cells.find((c) => c.value === s.item && !c.marked);
  if (cell === undefined || s.item === null || s.finished) return;
  const plan = PLANS[p.hits % PLANS.length] ?? 'inside';
  p.hits += 1;
  if (plan === 'inside') {
    await p.page.getByTestId(cell.testId).click();
    await expect(
      p.page.getByTestId(cell.testId),
      `${p.who} tapped ${String(s.item)}`,
    ).toHaveAttribute('data-marked', 'true', { timeout: 4_000 });
    p.insideTaps.push({ value: s.item, round });
    return;
  }
  const early =
    plan === 'miss' && p.missed === 'autoMarkAfter'
      ? watchEarly(p.page, cell.testId, hostSawAt)
      : undefined;
  p.pending.push({
    testId: cell.testId,
    value: s.item,
    drawnAt: s.at,
    plan,
    done: false,
    ...(early === undefined ? {} : { early }),
  });
}

// Watches a missed cell until the earliest moment the server may mark it: the host saw
// the draw at most SEEN_LATE_MS after the server made it, so a mark shown before
// hostSawAt + 3 s − SEEN_LATE_MS came before the 3 s. The checks between draws come too
// late to see an early auto-mark (NIGHT-6). Resolves to the ms after hostSawAt when it was
// marked in that time, else null. Not awaited here, so the other players go on meanwhile.
async function watchEarly(page: Page, testId: string, hostSawAt: number): Promise<number | null> {
  const until = hostSawAt + 3_000 - SEEN_LATE_MS;
  while (Date.now() < until) {
    const marked = await page
      .getByTestId(testId)
      .getAttribute('data-marked', { timeout: 500 })
      .catch(() => null);
    if (marked === 'true') return Date.now() - hostSawAt;
    await page.waitForTimeout(150).catch(() => undefined);
  }
  return null;
}

export async function handlePending(p: LivePlayer, s: LiveSnap): Promise<void> {
  for (const item of p.pending) {
    if (item.done) continue;
    const cell = s.cells.find((c) => c.testId === item.testId);
    // The round is over (its numbers left the ticker) or the card changed: nothing to check.
    if (cell === undefined || cell.value !== item.value || !s.ticker.includes(item.value)) {
      item.done = true;
      continue;
    }
    const elapsed = s.at - item.drawnAt;
    if (item.plan === 'late') await lateTap(p, item, elapsed, cell.marked);
    else {
      if (item.early !== undefined) {
        expect(
          await item.early,
          `${p.who}: missed ${String(item.value)} marked at once`,
        ).toBeNull();
      }
      checkMiss(p, item, elapsed, cell.marked);
    }
  }
  p.pending = p.pending.filter((x) => !x.done);
}

async function lateTap(
  p: LivePlayer,
  item: Pending,
  elapsed: number,
  marked: boolean,
): Promise<void> {
  const open = p.missed === 'noAutoMark';
  if (elapsed < (open ? 3_500 : 2_000)) return;
  item.done = true;
  if (marked) return;
  await p.page.getByTestId(item.testId).click();
  const feedback = p.page.getByTestId('card-feedback');
  // Short timeouts on both reads: without one, reading a feedback line that is not shown
  // waits longer than the whole poll (NIGHT-6: a late tap failed without being looked at).
  const outcome = async (): Promise<string> => {
    const text = await feedback.innerText({ timeout: 300 }).catch(() => '');
    // The round ended meanwhile: the tap said so, or the screen shows it now (a tap sent
    // just before the screen heard of the end is refused by the server instead).
    if (text.startsWith('Round over')) return 'round over';
    if ((await p.page.getByText('Round over').count()) > 0) return 'round over';
    const now = await p.page
      .getByTestId(item.testId)
      .getAttribute('data-marked', { timeout: 300 })
      .catch(() => null);
    // Still open: the feedback line goes into the failure message.
    return now === 'true' ? 'marked' : `open (${text})`;
  };
  // A late tap marks (without bonus); only a round that ended meanwhile refuses it.
  await expect
    .poll(outcome, { timeout: 4_000, message: `${p.who}: late tap on ${String(item.value)}` })
    .toMatch(/^(marked|round over)$/);
}

// How much later than the server's draw a screen may notice it (poll and render).
const SEEN_LATE_MS = 1_500;

function checkMiss(p: LivePlayer, item: Pending, elapsed: number, marked: boolean): void {
  if (p.missed === 'noAutoMark') {
    expect(marked, `${p.who}: missed ${String(item.value)} stays open (leave open)`).toBe(false);
    return;
  }
  if (marked) {
    // Not before the 3 s (less the time this screen may have seen the draw late).
    expect(
      elapsed,
      `${p.who}: missed ${String(item.value)} not marked early`,
    ).toBeGreaterThanOrEqual(3_000 - SEEN_LATE_MS);
    p.missTimings.push(elapsed);
    item.done = true;
  } else {
    expect(elapsed, `${p.who}: missed ${String(item.value)} marked after 3 s`).toBeLessThan(6_000);
  }
}
