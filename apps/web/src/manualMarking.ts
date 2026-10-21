/**
 * @file   apps/web/src/manualMarking.ts
 * @module web
 * @brief  Manual-marking rules of the Quick Test: tap, speed bonus, missed numbers (01 §6).
 *
 * Responsibility: pure state transitions for the owner's taps on one card. A tap on a
 *                 drawn cell marks it; inside the speed window it earns the decaying
 *                 speed bonus, later it marks without bonus. A tap on an undrawn cell is
 *                 refused, and so is every tap once the round has ended. A drawn cell left
 *                 open follows the starter's missed-number
 *                 rule: under autoMarkAfter it is marked without bonus once the delay has
 *                 passed, under noAutoMark it stays open until tapped. The owner's points
 *                 come from the server; this file only tracks marks and the bonus the
 *                 taps earned, which the Quick Test does not count (the match is computed
 *                 before playback). Production marking is validated by the server (WP-15).
 * Depends on:     ./types
 * Used by:        ./components/OwnerCard
 * Spec:           docs/spec/01-game-design.md §6, §8.1; docs/spec/15-implementation-plan.md WP-08
 */
import type { Cell, MissedNumbers } from './types.js';

export interface ManualRules {
  readonly maxSpeedBonus: number;
  readonly speedWindowMs: number;
  readonly missedNumbers: MissedNumbers;
  // The round has ended: taps are refused and nothing more is marked for the owner.
  readonly roundOver?: boolean;
}

export type Feedback =
  | { readonly kind: 'marked'; readonly bonus: number }
  | { readonly kind: 'refused' }
  | { readonly kind: 'alreadyMarked' }
  | { readonly kind: 'roundOver' }
  | { readonly kind: 'autoMarked'; readonly count: number; readonly delayMs: number };

export interface ManualState {
  readonly marks: readonly boolean[];
  readonly bonusEarned: number;
  readonly feedback: Feedback | null;
}

// Draw item → time (ms) the draw became visible to the owner.
export type DrawTimes = ReadonlyMap<number, number>;

export function initialManualState(cells: readonly Cell[]): ManualState {
  return { marks: cells.map((c) => c.kind === 'free'), bonusEarned: 0, feedback: null };
}

// Same linear decay as the domain's speedBonus (packages/domain/src/scoring/speedBonus.ts):
// maxBonus at delta 0, 0 at the end of the window.
export function speedBonus(rules: ManualRules, deltaMs: number): number {
  if (rules.speedWindowMs <= 0 || deltaMs < 0 || deltaMs > rules.speedWindowMs) return 0;
  return Math.round(rules.maxSpeedBonus * (1 - deltaMs / rules.speedWindowMs));
}

export interface TapInput {
  readonly state: ManualState;
  readonly cells: readonly Cell[];
  readonly index: number;
  readonly drawTimes: DrawTimes;
  readonly now: number;
  readonly rules: ManualRules;
}

export function tapCell({ state, cells, index, drawTimes, now, rules }: TapInput): ManualState {
  const cell = cells[index];
  if (cell === undefined || cell.kind === 'free') return state;
  // The round end closes every open tap (01 §6).
  if (rules.roundOver === true) return { ...state, feedback: { kind: 'roundOver' } };
  if (state.marks[index] === true) return { ...state, feedback: { kind: 'alreadyMarked' } };
  const drawnAt = drawTimes.get(cell.value);
  if (drawnAt === undefined) return { ...state, feedback: { kind: 'refused' } };
  // Zero once the window has closed: a late tap marks without bonus.
  const bonus = speedBonus(rules, now - drawnAt);
  return {
    marks: withMark(state.marks, index),
    bonusEarned: state.bonusEarned + bonus,
    feedback: { kind: 'marked', bonus },
  };
}

export interface AutoMarkInput {
  readonly state: ManualState;
  readonly cells: readonly Cell[];
  readonly drawTimes: DrawTimes;
  readonly now: number;
  readonly rules: ManualRules;
}

// autoMarkAfter: mark every drawn, open cell whose delay has passed, without bonus.
// noAutoMark: nothing is marked for the owner (01 §6).
export function autoMarkMissed({
  state,
  cells,
  drawTimes,
  now,
  rules,
}: AutoMarkInput): ManualState {
  const rule = rules.missedNumbers;
  if (rule.kind !== 'autoMarkAfter') return state;
  let marks = state.marks;
  let count = 0;
  cells.forEach((cell, i) => {
    if (cell.kind === 'free' || marks[i] === true) return;
    const drawnAt = drawTimes.get(cell.value);
    if (drawnAt === undefined || now - drawnAt < rule.delayMs) return;
    marks = withMark(marks, i);
    count += 1;
  });
  if (count === 0) return state;
  return { ...state, marks, feedback: { kind: 'autoMarked', count, delayMs: rule.delayMs } };
}

// Earliest moment an open cell is due to be marked for the owner, so the caller can
// schedule exactly one timer; null under noAutoMark, once the round has ended (so no
// timer marks anything after the round end), or when nothing is open.
export function nextAutoMark(
  state: ManualState,
  cells: readonly Cell[],
  drawTimes: DrawTimes,
  rules: ManualRules,
): number | null {
  const rule = rules.missedNumbers;
  if (rule.kind !== 'autoMarkAfter' || rules.roundOver === true) return null;
  let next: number | null = null;
  cells.forEach((cell, i) => {
    if (cell.kind === 'free' || state.marks[i] === true) return;
    const drawnAt = drawTimes.get(cell.value);
    if (drawnAt === undefined) return;
    const dueAt = drawnAt + rule.delayMs;
    if (next === null || dueAt < next) next = dueAt;
  });
  return next;
}

export function feedbackText(feedback: Feedback | null): string {
  if (feedback === null) return 'Tap a drawn number on your card.';
  switch (feedback.kind) {
    case 'marked':
      return feedback.bonus > 0
        ? `Marked · speed bonus +${String(feedback.bonus)}`
        : 'Marked late · no speed bonus';
    case 'refused':
      return 'Not drawn yet — refused';
    case 'alreadyMarked':
      return 'Already marked';
    case 'roundOver':
      return 'Round over — no more taps';
    case 'autoMarked':
      return `Marked ${String(feedback.count)} for you without bonus (after ${seconds(feedback.delayMs)} s)`;
  }
}

function seconds(ms: number): string {
  return String(Math.round(ms / 100) / 10);
}

function withMark(marks: readonly boolean[], index: number): readonly boolean[] {
  const next = marks.slice();
  next[index] = true;
  return next;
}
