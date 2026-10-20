/**
 * @file   apps/web/src/components/OwnerCard.tsx
 * @module web
 * @brief  The owner's card with manual tap, speed window and auto fallback (WP-08).
 *
 * Responsibility: render one of the owner's cards. In `manual` mode the owner taps (or
 *                 presses Enter/Space on) a drawn cell to mark it; the rules live in
 *                 ../manualMarking: speed bonus by time since the draw, refusal of
 *                 undrawn cells, auto-mark without bonus when a cell's speed window
 *                 closes (01 §6). In `auto` mode the card shows the server's marks.
 * Depends on:     react, ../types, ../playback, ../manualMarking
 * Used by:        ./Playback
 * Spec:           docs/spec/01-game-design.md §6, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

import {
  closeExpiredWindows,
  feedbackText,
  initialManualState,
  nextWindowClose,
  tapCell,
  type ManualRules,
  type ManualState,
} from '../manualMarking.js';
import type { PlaybackView } from '../playback.js';
import type { PlayerSummary, QuickTestResult } from '../types.js';

export interface OwnerCardProps {
  readonly player: PlayerSummary;
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}

export function OwnerCard({ player, result, view }: OwnerCardProps): ReactElement {
  const manualMode = result.markingMode === 'manual';
  const rules: ManualRules = result;
  const cells = player.card.cells;
  const [manual, setManual] = useState<ManualState>(() => initialManualState(cells));
  const drawTimes = useDrawTimes(view.drawsSoFar);
  useWindowCloser({ enabled: manualMode, manual, setManual, cells, drawTimes, rules });
  const marks = manualMode ? manual.marks : player.marks;
  const handleTap = (index: number): void => {
    if (!manualMode) return;
    setManual((state) =>
      tapCell({ state, cells, index, drawTimes: drawTimes.current, now: Date.now(), rules }),
    );
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTap(index);
    }
  };
  return (
    <div style={{ background: '#1a2130', padding: '0.5rem', borderRadius: '0.5rem' }}>
      <TapGrid player={player} marks={marks} onTap={handleTap} onKey={onKey} />
      <p style={{ margin: '0.4rem 0 0', color: '#dfe6ee' }}>
        {String(manualMode ? manual.points : player.points)} pts
        {manualMode && ` · speed bonus earned: ${String(manual.bonusEarned)}`}
      </p>
      <p
        data-testid="owner-feedback"
        style={{ color: '#9aa5b2', fontSize: '0.9rem', minHeight: '1.2em', margin: 0 }}
      >
        {manualMode ? feedbackText(manual.feedback) : 'Auto mode: marks happen for you'}
      </p>
    </div>
  );
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
  readonly cells: PlayerSummary['card']['cells'];
  readonly drawTimes: { readonly current: Map<number, number> };
  readonly rules: ManualRules;
}

// One timer for the earliest pending window close; re-armed after every state change.
function useWindowCloser({
  enabled,
  manual,
  setManual,
  cells,
  drawTimes,
  rules,
}: CloserArgs): void {
  const closesAt = enabled ? nextWindowClose(manual, cells, drawTimes.current, rules) : null;
  useEffect(() => {
    if (closesAt === null) return undefined;
    const id = window.setTimeout(
      () => {
        setManual((state) =>
          closeExpiredWindows({
            state,
            cells,
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
  }, [closesAt, setManual, cells, drawTimes, rules]);
}

interface TapGridProps {
  readonly player: PlayerSummary;
  readonly marks: readonly boolean[];
  readonly onTap: (index: number) => void;
  readonly onKey: (e: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

function TapGrid({ player, marks, onTap, onKey }: TapGridProps): ReactElement {
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      <strong style={{ color: '#afb84e' }}>{player.accountId} (you)</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 2.5rem)', gap: '2px' }}>
        {player.card.cells.map((cell, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onTap(i);
            }}
            onKeyDown={(e) => {
              onKey(e, i);
            }}
            aria-label={`cell-${String(i)}`}
            data-testid={`owner-cell-${String(i)}`}
            data-marked={marks[i] === true ? 'true' : 'false'}
            style={cellStyle(cell.kind, marks[i] ?? false)}
          >
            {cellContent(cell)}
          </button>
        ))}
      </div>
    </div>
  );
}

function cellStyle(kind: 'number' | 'free' | 'symbol', marked: boolean): React.CSSProperties {
  return {
    width: '2.5rem',
    height: '2.5rem',
    display: 'grid',
    placeItems: 'center',
    background: marked ? '#04aaf7' : kind === 'free' ? '#2a3645' : '#1a2130',
    color: marked ? '#0f1115' : '#e7ecf3',
    fontSize: '0.9rem',
    borderRadius: '0.25rem',
    border: 0,
    cursor: 'pointer',
  };
}

function cellContent(cell: PlayerSummary['card']['cells'][number]): string {
  if (cell.kind === 'number') return String(cell.value);
  if (cell.kind === 'symbol') {
    const map: Record<number, string> = { 101: '🌱', 102: '☀️', 103: '🍂', 104: '❄️' };
    return map[cell.value] ?? '?';
  }
  return '★';
}
