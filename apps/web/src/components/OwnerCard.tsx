/**
 * @file   apps/web/src/components/OwnerCard.tsx
 * @module web
 * @brief  One of the owner's cards: taps, speed bonus, missed-number rule (WP-08, 01 §6).
 *
 * Responsibility: render the owner's card of the current round with its season cells.
 *                 When the owner taps (`manual`), a tap or Enter/Space on a drawn cell
 *                 marks it; the rules live in ../manualMarking: speed bonus inside the
 *                 window, a late tap without bonus, refusal of undrawn cells, and the
 *                 starter's missed-number rule (marked for the owner after the delay, or
 *                 left open). The speed bonus is shown apart from the points, because the
 *                 Quick Test computes the match before playback and cannot count it. In
 *                 `auto` mode the card shows the server's marks. The parent remounts it per round
 *                 (new card, new marks); between the round end and the next round the
 *                 last number stays on screen and every tap is refused.
 * Depends on:     react, ./BingoHeader, ./CellFace, ../manualMarking, ../useReducedMotion, ../types
 * Used by:        ./OwnerArea; TapGrid also by the live card (../game/LiveCard)
 * Spec:           docs/spec/01-game-design.md §6, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

import { BingoHeader } from './BingoHeader.js';
import { CellFace, cellBoxStyle } from './CellFace.js';
import {
  autoMarkMissed,
  feedbackText,
  initialManualState,
  nextAutoMark,
  tapCell,
  type ManualRules,
  type ManualState,
} from '../manualMarking.js';
import { useReducedMotion } from '../useReducedMotion.js';
import { ballLabel, SEASON_NAMES, type Card, type QuickTestResult } from '../types.js';

export interface OwnerCardProps {
  readonly accountId: string;
  readonly card: Card;
  readonly serverMarks: readonly boolean[];
  readonly result: QuickTestResult;
  readonly drawsSoFar: readonly number[];
  // The round has ended: its last number is shown, but taps are closed (01 §6).
  readonly roundOver: boolean;
}

export function OwnerCard(props: OwnerCardProps): ReactElement {
  const { accountId, card, serverMarks, result, drawsSoFar, roundOver } = props;
  const manualMode = result.markingMode === 'manual';
  const rules = useMemo<ManualRules>(() => ({ ...result, roundOver }), [result, roundOver]);
  const [manual, setManual] = useState<ManualState>(() => initialManualState(card.cells));
  const [lastTapped, setLastTapped] = useState<number | null>(null);
  const drawTimes = useDrawTimes(drawsSoFar);
  useAutoMarker({ enabled: manualMode, manual, setManual, card, drawTimes, rules });
  const marks = manualMode ? manual.marks : serverMarks;
  const tap = (index: number): void => {
    if (!manualMode) return;
    setLastTapped(index);
    setManual((state) =>
      tapCell({
        state,
        cells: card.cells,
        index,
        drawTimes: drawTimes.current,
        now: Date.now(),
        rules,
      }),
    );
  };
  return (
    <div
      style={{ background: 'var(--color-surface-2)', padding: '0.5rem', borderRadius: '0.5rem' }}
    >
      <strong style={{ color: 'var(--color-text)' }}>{accountId} (you)</strong>
      <TapGrid card={card} marks={marks} lastTapped={lastTapped} onTap={tap} />
      {manualMode ? (
        <p style={{ margin: '0.4rem 0 0', color: 'var(--color-text)' }} data-testid="owner-bonus">
          +{String(manual.bonusEarned)} speed bonus (not counted in Quick Test cuts)
        </p>
      ) : null}
      <p
        data-testid="owner-feedback"
        role="status"
        style={{
          color: 'var(--color-text-muted)',
          fontSize: '0.9rem',
          minHeight: '1.2em',
          margin: 0,
        }}
      >
        {manualMode ? feedbackText(manual.feedback) : 'Marking: numbers are marked for you'}
      </p>
    </div>
  );
}

// Remember when each draw first became visible; the speed window and the missed-number
// delay run from that moment.
function useDrawTimes(drawsSoFar: readonly number[]): { readonly current: Map<number, number> } {
  const times = useRef(new Map<number, number>());
  const now = Date.now();
  for (const item of drawsSoFar) if (!times.current.has(item)) times.current.set(item, now);
  return times;
}

interface MarkerArgs {
  readonly enabled: boolean;
  readonly manual: ManualState;
  readonly setManual: (update: (state: ManualState) => ManualState) => void;
  readonly card: Card;
  readonly drawTimes: { readonly current: Map<number, number> };
  readonly rules: ManualRules;
}

// One timer for the earliest missed number due to be marked for the owner; re-armed
// after every state change. Never armed under noAutoMark.
function useAutoMarker({ enabled, manual, setManual, card, drawTimes, rules }: MarkerArgs): void {
  const dueAt = enabled ? nextAutoMark(manual, card.cells, drawTimes.current, rules) : null;
  useEffect(() => {
    if (dueAt === null) return undefined;
    const id = window.setTimeout(
      () => {
        setManual((state) =>
          autoMarkMissed({
            state,
            cells: card.cells,
            drawTimes: drawTimes.current,
            now: Date.now(),
            rules,
          }),
        );
      },
      Math.max(0, dueAt - Date.now()),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [dueAt, setManual, card, drawTimes, rules]);
}

// The season of a season cell (Card.seasonCells is in season order), else empty.
function seasonOfCell(card: Card, index: number): string {
  const position = card.seasonCells?.indexOf(index) ?? -1;
  return SEASON_NAMES[position] ?? '';
}

// Screen-reader name of a cell: "G 52", the season of a symbol cell, or "free".
function cellName(cell: Card['cells'][number]): string {
  return cell.kind === 'free' ? 'free' : ballLabel(cell.value);
}

export interface TapGridProps {
  readonly card: Card;
  readonly marks: readonly boolean[];
  readonly lastTapped: number | null;
  readonly onTap: (index: number) => void;
}

export function TapGrid({ card, marks, lastTapped, onTap }: TapGridProps): ReactElement {
  const reduced = useReducedMotion();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onTap(index);
  };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, var(--cell-size, 2.6rem))',
        gap: '2px',
      }}
    >
      <BingoHeader />
      {card.cells.map((cell, i) => {
        const marked = marks[i] === true;
        const animate = !reduced && marked && lastTapped === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              onTap(i);
            }}
            onKeyDown={(e) => {
              onKey(e, i);
            }}
            aria-label={cellName(cell)}
            aria-pressed={marked}
            data-testid={`owner-cell-${String(i)}`}
            data-value={cell.kind === 'free' ? '' : String(cell.value)}
            data-marked={marked ? 'true' : 'false'}
            data-season={seasonOfCell(card, i)}
            className={animate ? 'sbr-anim-mark' : undefined}
            style={cellBoxStyle(card, i, marked)}
          >
            <CellFace card={card} index={i} />
          </button>
        );
      })}
    </div>
  );
}
