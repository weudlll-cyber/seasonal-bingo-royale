/**
 * @file   e2e/acceptance/play.ts
 * @module e2e/acceptance
 * @brief  Plays a Quick Test match draw by draw like the owner, checking after each draw.
 *
 * Responsibility: drive timed or host draws (optionally switching mid-match), and when the
 *                 owner taps, treat each owner number drawn in turn as: tapped inside the
 *                 window, tapped late, or missed on purpose. Missed numbers must stay open
 *                 under "leave open" and be marked after exactly the delay under "mark for
 *                 me after N seconds"; a late tap under "leave open" marks without bonus;
 *                 a tap on the number that ended the round is refused.
 *                 Every new picture of the page goes through ./checks.
 * Depends on:     @playwright/test, ./snapshot, ./checks
 * Used by:        ./acceptance.spec.ts
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/12-testing-strategy.md §8
 */
import { expect, type Page } from '@playwright/test';

import { checkScreen, type RunContext } from './checks.js';
import { snapshot, tickKey, type Snap } from './snapshot.js';

export interface PlayOptions {
  readonly mode: 'auto' | 'host';
  // Draw count at which to switch to host draws for four draws and back to timed draws.
  readonly switchAt?: number;
  readonly maxDraws?: number;
}

interface Pending {
  readonly testId: string;
  readonly round: number;
  readonly drawnAt: number;
  readonly plan: 'late' | 'miss';
  done: boolean;
}

const PLANS = ['inside', 'late', 'miss'] as const;
// Timing tolerance: the test sees a draw up to one poll (~100 ms) after the page did.
const EARLY_MS = 400;
const LATE_MS = 900;

export async function play(page: Page, ctx: RunContext, opts: PlayOptions): Promise<Snap> {
  let prev = await snapshot(page);
  checkScreen(prev, null, ctx);
  let mode = opts.mode;
  let pending: Pending[] = [];
  for (let drawn = 0; !prev.finished && drawn < (opts.maxDraws ?? Infinity); drawn += 1) {
    mode = await maybeSwitch(page, mode, drawn, opts.switchAt);
    if (mode === 'host') {
      prev = await settle(page, prev, ctx, pending);
      await page.getByTestId('draw-next').click();
    }
    const next = await waitForTick(page, prev, ctx, pending);
    checkScreen(next, prev, ctx);
    pending = pending.filter((p) => p.round === next.round && !p.done);
    pending.push(...(await actOnNewDraw(page, next, ctx)));
    prev = next;
  }
  return prev;
}

async function maybeSwitch(
  page: Page,
  mode: 'auto' | 'host',
  drawn: number,
  switchAt: number | undefined,
): Promise<'auto' | 'host'> {
  if (switchAt === undefined) return mode;
  if (drawn === switchAt) {
    await page.getByTestId('draw-mode-host').click();
    return 'host';
  }
  if (drawn === switchAt + 4) {
    await page.getByTestId('draw-mode-timed').click();
    return 'auto';
  }
  return mode;
}

// Polls until the next draw is shown, handling due taps and miss checks meanwhile.
async function waitForTick(
  page: Page,
  prev: Snap,
  ctx: RunContext,
  pending: Pending[],
): Promise<Snap> {
  const started = Date.now();
  for (;;) {
    const s = await snapshot(page);
    await handlePending(page, s, ctx, pending);
    if (tickKey(s) !== tickKey(prev)) return s;
    if (Date.now() - started > 15_000) throw new Error(`no draw after ${tickKey(prev)}`);
    await page.waitForTimeout(100);
  }
}

// Host draws: let every late tap and timed miss resolve before the next draw.
async function settle(page: Page, prev: Snap, ctx: RunContext, pending: Pending[]): Promise<Snap> {
  let s = prev;
  while (pending.some((p) => !p.done && (p.plan === 'late' || ctx.missed === 'autoMarkAfter'))) {
    await page.waitForTimeout(100);
    s = await snapshot(page);
    checkScreen(s, null, ctx);
    await handlePending(page, s, ctx, pending);
  }
  return s;
}

async function actOnNewDraw(page: Page, s: Snap, ctx: RunContext): Promise<Pending[]> {
  const newest = s.ticker.at(-1);
  const cell = s.cells.find((c) => c.value === newest && !c.marked);
  if (!ctx.tapping || cell === undefined) return [];
  if (s.roundOver) {
    // The round end closes every tap (01 §6): the last number is shown but refused.
    await page.getByTestId(cell.testId).click();
    await expect(page.getByTestId('owner-feedback')).toHaveText('Round over — no more taps');
    await expect(page.getByTestId(cell.testId)).toHaveAttribute('data-marked', 'false');
    return [];
  }
  const plan = PLANS[ctx.ownerHits % PLANS.length] ?? 'inside';
  ctx.ownerHits += 1;
  if (plan === 'inside') {
    await page.getByTestId(cell.testId).click();
    await expect(page.getByTestId(cell.testId)).toHaveAttribute('data-marked', 'true');
    return [];
  }
  return [{ testId: cell.testId, round: s.round, drawnAt: s.at, plan, done: false }];
}

async function handlePending(
  page: Page,
  s: Snap,
  ctx: RunContext,
  pending: Pending[],
): Promise<void> {
  for (const p of pending) {
    if (p.done || p.round !== s.round) continue;
    const cell = s.cells.find((c) => c.testId === p.testId);
    if (cell === undefined) continue;
    const elapsed = s.at - p.drawnAt;
    if (p.plan === 'late') await lateTap(page, p, ctx, { marked: cell.marked, elapsed });
    else checkMiss(p, ctx, { marked: cell.marked, elapsed });
  }
}

interface CellTime {
  readonly marked: boolean;
  readonly elapsed: number;
}

// Late: after the window under "leave open", near the end of the window otherwise.
async function lateTap(page: Page, p: Pending, ctx: RunContext, t: CellTime): Promise<void> {
  const open = ctx.missed === 'noAutoMark';
  if (t.elapsed < (open ? 3_500 : 2_000)) return;
  p.done = true;
  if (t.marked) return; // marked for the owner meanwhile (mark after N s)
  await page.getByTestId(p.testId).click();
  await expect(page.getByTestId(p.testId)).toHaveAttribute('data-marked', 'true');
  if (open) {
    await expect(page.getByTestId('owner-feedback')).toHaveText('Marked late · no speed bonus');
  }
}

function checkMiss(p: Pending, ctx: RunContext, t: CellTime): void {
  if (ctx.missed === 'noAutoMark') {
    expect(t.marked, `missed ${p.testId} stays open until tapped`).toBe(false);
    return;
  }
  if (t.elapsed < ctx.delayMs - EARLY_MS) {
    expect(t.marked, `missed ${p.testId} not marked before ${String(ctx.delayMs)} ms`).toBe(false);
  } else if (t.marked) {
    ctx.missTimings.push(t.elapsed);
    p.done = true;
  } else {
    expect(t.elapsed, `missed ${p.testId} marked by ${String(ctx.delayMs)} ms`).toBeLessThan(
      ctx.delayMs + LATE_MS,
    );
  }
}
