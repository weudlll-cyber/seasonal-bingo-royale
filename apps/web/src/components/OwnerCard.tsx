/**
 * @file   apps/web/src/components/OwnerCard.tsx
 * @module web
 * @brief  The owner's card with manual tap, speed window and auto fallback (WP-08).
 *
 * Responsibility: render one of the owner's cards; in `manual` mode let the owner
 *                 click (or press space) a drawn cell to mark it, awarding the speed
 *                 bonus from the ruleset when inside the speed window and auto-marking
 *                 drawn-but-unmarked cells without the bonus when the window closes
 *                 (01 §6). In `auto` mode cards get the server-computed marks.
 * Depends on:     react, ../types, ../playback, ./CardGrid
 * Used by:        ../App
 * Spec:           docs/spec/01-game-design.md §6, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { useEffect, useState, type ReactElement, type KeyboardEvent } from 'react';

import type { PlayerSummary, QuickTestResult } from '../types.js';
import type { PlaybackView } from '../playback.js';

export interface OwnerCardProps {
  readonly player: PlayerSummary;
  readonly result: QuickTestResult;
  readonly view: PlaybackView;
}

interface ManualState {
  readonly marks: readonly boolean[];
  readonly points: number;
  readonly bonusEarned: number;
  readonly lastFeedback: string;
}

export function OwnerCard({ player, result, view }: OwnerCardProps): ReactElement {
  const [manual, setManual] = useState<ManualState>(() => ({
    marks: player.card.cells.map((c) => c.kind === 'free'),
    points: 0,
    bonusEarned: 0,
    lastFeedback: '',
  }));
  // Auto-mark drawn cells left unmarked past the speed window (01 §6).
  useEffect(() => {
    if (result.markingMode !== 'manual') return;
    const drawn = new Set(view.drawsSoFar);
    setManual((prev) => autoMarkPast(prev, player, drawn));
  }, [view.drawsSoFar, player, result.markingMode]);
  const marks = result.markingMode === 'manual' ? manual.marks : player.marks;
  const handleTap = (index: number): void => {
    if (result.markingMode !== 'manual') return;
    setManual((prev) => tapCell({ prev, player, result, index, drawsSoFar: view.drawsSoFar }));
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
      <ScoreLine player={player} manual={manual} result={result} />
      <p
        data-testid="owner-feedback"
        style={{ color: '#9aa5b2', fontSize: '0.9rem', minHeight: '1.2em', margin: 0 }}
      >
        {result.markingMode === 'manual' ? manual.lastFeedback : 'auto mode: marks happen for you'}
      </p>
    </div>
  );
}

function TapGrid({
  player,
  marks,
  onTap,
  onKey,
}: {
  readonly player: PlayerSummary;
  readonly marks: readonly boolean[];
  readonly onTap: (index: number) => void;
  readonly onKey: (e: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}): ReactElement {
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
    const key = cell.value as 101 | 102 | 103 | 104;
    const map: Record<number, string> = { 101: '🌱', 102: '☀️', 103: '🍂', 104: '❄️' };
    return map[key] ?? '?';
  }
  return '★';
}

function ScoreLine({
  player,
  manual,
  result,
}: {
  player: PlayerSummary;
  manual: ManualState;
  result: QuickTestResult;
}): ReactElement {
  const points = result.markingMode === 'manual' ? manual.points : player.points;
  return (
    <p style={{ margin: '0.4rem 0 0', color: '#dfe6ee' }}>
      {String(points)} pts
      {result.markingMode === 'manual' && ` · speed bonus earned: ${String(manual.bonusEarned)}`}
    </p>
  );
}

interface TapArgs {
  readonly prev: ManualState;
  readonly player: PlayerSummary;
  readonly result: QuickTestResult;
  readonly index: number;
  readonly drawsSoFar: readonly number[];
}

function tapCell(args: TapArgs): ManualState {
  const { prev, player, result, index, drawsSoFar } = args;
  if (prev.marks[index]) return { ...prev, lastFeedback: 'already marked' };
  const cell = player.card.cells[index];
  if (cell === undefined || cell.kind === 'free') return prev;
  const drawn = drawsSoFar.includes(cell.value);
  if (!drawn) return { ...prev, lastFeedback: 'that number has not been drawn — refused' };
  const marks = prev.marks.slice();
  marks[index] = true;
  const bonus = result.maxSpeedBonus;
  return {
    marks,
    points: prev.points + result.pointsPerMark + bonus,
    bonusEarned: prev.bonusEarned + bonus,
    lastFeedback: `marked · +${String(result.pointsPerMark)} pts (+${String(bonus)} speed bonus)`,
  };
}

function autoMarkPast(
  prev: ManualState,
  player: PlayerSummary,
  drawn: ReadonlySet<number>,
): ManualState {
  // Only auto-mark once at least 10 draws have passed since the start of the round;
  // this gives the owner time to tap for the speed bonus (01 §6 window close).
  if (drawn.size <= 10) return prev;
  const marks = prev.marks.slice();
  let added = 0;
  player.card.cells.forEach((cell, i) => {
    if (marks[i]) return;
    const value = cell.kind === 'free' ? null : cell.value;
    if (value !== null && drawn.has(value)) {
      marks[i] = true;
      added += 1;
    }
  });
  if (added === 0) return prev;
  return {
    ...prev,
    marks,
    points: prev.points + added * 10,
    lastFeedback: 'auto-marked (window closed)',
  };
}
