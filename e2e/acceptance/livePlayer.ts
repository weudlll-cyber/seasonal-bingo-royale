/**
 * @file   e2e/acceptance/livePlayer.ts
 * @module e2e/acceptance
 * @brief  A player in the real-game play-through: taps inside the window, late, or misses.
 *
 * Responsibility: each number drawn on the player's card is in turn tapped at once (inside
 *                 the speed window), tapped late, or missed on purpose. A late tap under
 *                 "leave open" comes after the window and must mark without bonus (or be
 *                 refused once the round is over); under "mark after 3 s" it comes at 2 s. A
 *                 missed number must stay open under "leave open" for as long as its round
 *                 runs, and be marked for the player within a few seconds under "mark after
 *                 3 s". The server decides every mark; the screen shows the server's marks.
 * Depends on:     @playwright/test, ./liveSnap
 * Used by:        ./realGame.spec.ts
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
}

export interface LivePlayer {
  readonly page: Page;
  readonly who: string;
  readonly missed: 'autoMarkAfter' | 'noAutoMark';
  hits: number;
  pending: Pending[];
  readonly missTimings: number[];
}

export function newPlayer(page: Page, who: string, missed: LivePlayer['missed']): LivePlayer {
  return { page, who, missed, hits: 0, pending: [], missTimings: [] };
}

// A new number is on screen: plan what this player does with it, if it is on the card.
export async function onNewDraw(p: LivePlayer, s: LiveSnap): Promise<void> {
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
    return;
  }
  p.pending.push({ testId: cell.testId, value: s.item, drawnAt: s.at, plan, done: false });
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
    else checkMiss(p, item, elapsed, cell.marked);
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
  await expect
    .poll(
      async () => {
        const text = await feedback.innerText().catch(() => '');
        const now = await p.page
          .getByTestId(item.testId)
          .getAttribute('data-marked')
          .catch(() => null);
        return now === 'true' || text.startsWith('Round over') || text.startsWith('Not marked');
      },
      { timeout: 4_000 },
    )
    .toBe(true);
}

function checkMiss(p: LivePlayer, item: Pending, elapsed: number, marked: boolean): void {
  if (p.missed === 'noAutoMark') {
    expect(marked, `${p.who}: missed ${String(item.value)} stays open (leave open)`).toBe(false);
    return;
  }
  if (marked) {
    p.missTimings.push(elapsed);
    item.done = true;
  } else {
    expect(elapsed, `${p.who}: missed ${String(item.value)} marked after 3 s`).toBeLessThan(6_000);
  }
}
