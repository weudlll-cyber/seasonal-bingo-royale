/**
 * @file   apps/web/src/manualMarking.ts
 * @module web
 * @brief  Manual-marking rules of the Quick Test: tap, speed bonus, window close (01 §6).
 *
 * Responsibility: pure state transitions for the owner's taps on one card. A tap on a
 *                 drawn cell marks it and earns the speed bonus for the time since the
 *                 draw; a tap on an undrawn cell is refused; a drawn cell left unmarked
 *                 is auto-marked without bonus when its speed window closes.
 *                 Dev-only Quick Test: the browser scores the owner's own taps here;
 *                 production marking is validated by the server (01 §6, WP-15).
 * Depends on:     ./types
 * Used by:        ./components/OwnerCard
 * Spec:           docs/spec/01-game-design.md §6, §8.1; docs/spec/15-implementation-plan.md WP-08
 */
import type { Cell } from './types.js';

export interface ManualRules {
  readonly pointsPerMark: number;
  readonly maxSpeedBonus: number;
  readonly speedWindowMs: number;
}

export type Feedback =
  | { readonly kind: 'marked'; readonly points: number; readonly bonus: number }
  | { readonly kind: 'refused' }
  | { readonly kind: 'alreadyMarked' }
  | { readonly kind: 'autoMarked'; readonly count: number };

export interface ManualState {
  readonly marks: readonly boolean[];
  readonly points: number;
  readonly bonusEarned: number;
  readonly feedback: Feedback | null;
}

// Draw item → time (ms) the draw became visible to the owner.
export type DrawTimes = ReadonlyMap<number, number>;

export function initialManualState(cells: readonly Cell[]): ManualState {
  return { marks: cells.map((c) => c.kind === 'free'), points: 0, bonusEarned: 0, feedback: null };
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
  if (state.marks[index] === true) return { ...state, feedback: { kind: 'alreadyMarked' } };
  const drawnAt = drawTimes.get(cell.value);
  if (drawnAt === undefined) return { ...state, feedback: { kind: 'refused' } };
  const bonus = speedBonus(rules, now - drawnAt);
  const points = rules.pointsPerMark + bonus;
  return {
    marks: withMark(state.marks, index),
    points: state.points + points,
    bonusEarned: state.bonusEarned + bonus,
    feedback: { kind: 'marked', points, bonus },
  };
}

export interface CloseInput {
  readonly state: ManualState;
  readonly cells: readonly Cell[];
  readonly drawTimes: DrawTimes;
  readonly now: number;
  readonly rules: ManualRules;
}

// Auto-mark every drawn, unmarked cell whose speed window has closed; no bonus (01 §6).
export function closeExpiredWindows({
  state,
  cells,
  drawTimes,
  now,
  rules,
}: CloseInput): ManualState {
  let marks = state.marks;
  let count = 0;
  cells.forEach((cell, i) => {
    if (cell.kind === 'free' || marks[i] === true) return;
    const drawnAt = drawTimes.get(cell.value);
    if (drawnAt === undefined || now - drawnAt < rules.speedWindowMs) return;
    marks = withMark(marks, i);
    count += 1;
  });
  if (count === 0) return state;
  return {
    ...state,
    marks,
    points: state.points + count * rules.pointsPerMark,
    feedback: { kind: 'autoMarked', count },
  };
}

// Earliest moment a pending window closes, so the caller can schedule exactly one timer.
export function nextWindowClose(
  state: ManualState,
  cells: readonly Cell[],
  drawTimes: DrawTimes,
  rules: ManualRules,
): number | null {
  let next: number | null = null;
  cells.forEach((cell, i) => {
    if (cell.kind === 'free' || state.marks[i] === true) return;
    const drawnAt = drawTimes.get(cell.value);
    if (drawnAt === undefined) return;
    const closesAt = drawnAt + rules.speedWindowMs;
    if (next === null || closesAt < next) next = closesAt;
  });
  return next;
}

export function feedbackText(feedback: Feedback | null): string {
  if (feedback === null) return 'Tap a drawn number on your card.';
  switch (feedback.kind) {
    case 'marked':
      return `Marked · +${String(feedback.points)} pts (speed bonus +${String(feedback.bonus)})`;
    case 'refused':
      return 'Not drawn yet — refused';
    case 'alreadyMarked':
      return 'Already marked';
    case 'autoMarked':
      return `Auto-marked ${String(feedback.count)} without bonus (window closed)`;
  }
}

function withMark(marks: readonly boolean[], index: number): readonly boolean[] {
  const next = marks.slice();
  next[index] = true;
  return next;
}
