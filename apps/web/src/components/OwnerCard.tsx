/**
 * @file   apps/web/src/components/OwnerCard.tsx
 * @module web
 * @brief  One of the owner's cards: manual tap, speed window, auto fallback (WP-08).
 *
 * Responsibility: render the owner's card of the current round with its season cells.
 *                 In `manual` mode the owner taps (or presses Enter/Space on) a drawn
 *                 cell; the rules live in ../manualMarking: speed bonus by time since
 *                 the draw, refusal of undrawn cells, auto-mark without bonus when a
 *                 cell's speed window closes (01 §6). In `auto` mode the card shows the
 *                 server's marks. The parent remounts it per round (new card, new marks).
 * Depends on:     react, ./BingoHeader, ./CellFace, ../manualMarking, ../useReducedMotion, ../types
 * Used by:        ./Playback
 * Spec:           docs/spec/01-game-design.md §6, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

import { BingoHeader } from './BingoHeader.js';
import { CellFace, cellBoxStyle } from './CellFace.js';
import {
  closeExpiredWindows,
  feedbackText,
  initialManualState,
  nextWindowClose,
  tapCell,
  type ManualRules,
  type ManualState,
} from '../manualMarking.js';
import { useReducedMotion } from '../useReducedMotion.js';
import { ballLabel, type Card, type QuickTestResult } from '../types.js';

export interface OwnerCardProps {
  readonly accountId: string;
  readonly card: Card;
  readonly serverMarks: readonly boolean[];
  readonly result: QuickTestResult;
  readonly drawsSoFar: readonly number[];
}

export function OwnerCard(props: OwnerCardProps): ReactElement {
  const { accountId, card, serverMarks, result, drawsSoFar } = props;
  const manualMode = result.markingMode === 'manual';
  const rules: ManualRules = result;
  const [manual, setManual] = useState<ManualState>(() => initialManualState(card.cells));
  const [lastTapped, setLastTapped] = useState<number | null>(null);
  const drawTimes = useDrawTimes(drawsSoFar);
  useWindowCloser({ enabled: manualMode, manual, setManual, card, drawTimes, rules });
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
    <div style={{ background: '#1a2130', padding: '0.5rem', borderRadius: '0.5rem' }}>
      <strong style={{ color: '#afb84e' }}>{accountId} (you)</strong>
      <TapGrid card={card} marks={marks} lastTapped={lastTapped} onTap={tap} />
      <p style={{ margin: '0.4rem 0 0', color: '#dfe6ee' }} data-testid="owner-points">
        {String(manualMode ? manual.points : markedCount(serverMarks))}
        {manualMode
          ? ` pts this round · speed bonus earned: ${String(manual.bonusEarned)}`
          : ' cells marked'}
      </p>
      <p
        data-testid="owner-feedback"
        role="status"
        style={{ color: '#9aa5b2', fontSize: '0.9rem', minHeight: '1.2em', margin: 0 }}
      >
        {manualMode ? feedbackText(manual.feedback) : 'Auto mode: marks happen for you'}
      </p>
    </div>
  );
}

function markedCount(marks: readonly boolean[]): number {
  return marks.filter(Boolean).length - 1; // the free centre is not a mark
}

// Remember when each draw first became visible; the speed window runs from that moment.
function useDrawTimes(drawsSoFar: readonly number[]): { readonly current: Map<number, number> } {
  const times = useRef(new Map<number, number>());
  const now = Date.now();
  for (const item of drawsSoFar) if (!times.current.has(item)) times.current.set(item, now);
  return times;
}

interface CloserArgs {
  readonly enabled: boolean;
  readonly manual: ManualState;
  readonly setManual: (update: (state: ManualState) => ManualState) => void;
  readonly card: Card;
  readonly drawTimes: { readonly current: Map<number, number> };
  readonly rules: ManualRules;
}

// One timer for the earliest pending window close; re-armed after every state change.
function useWindowCloser({ enabled, manual, setManual, card, drawTimes, rules }: CloserArgs): void {
  const closesAt = enabled ? nextWindowClose(manual, card.cells, drawTimes.current, rules) : null;
  useEffect(() => {
    if (closesAt === null) return undefined;
    const id = window.setTimeout(
      () => {
        setManual((state) =>
          closeExpiredWindows({
            state,
            cells: card.cells,
            drawTimes: drawTimes.current,
            now: Date.now(),
            rules,
          }),
        );
      },
      Math.max(0, closesAt - Date.now()),
    );
    return () => {
      window.clearTimeout(id);
    };
  }, [closesAt, setManual, card, drawTimes, rules]);
}

// Screen-reader name of a cell: "G 52", the season of a symbol cell, or "free".
function cellName(cell: Card['cells'][number]): string {
  return cell.kind === 'free' ? 'free' : ballLabel(cell.value);
}

interface TapGridProps {
  readonly card: Card;
  readonly marks: readonly boolean[];
  readonly lastTapped: number | null;
  readonly onTap: (index: number) => void;
}

function TapGrid({ card, marks, lastTapped, onTap }: TapGridProps): ReactElement {
  const reduced = useReducedMotion();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onTap(index);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 2.6rem)', gap: '2px' }}>
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
