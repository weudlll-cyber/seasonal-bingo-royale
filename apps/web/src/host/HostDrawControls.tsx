/**
 * @file   apps/web/src/host/HostDrawControls.tsx
 * @module web/host
 * @brief  The host's draw control in a live match: Draw next, timed/host switch, seconds (D8).
 *
 * Responsibility: a big "Draw next" for host draws, also on the Space key while no field
 *                 has focus; it is usable only while the round runs, the previous number's
 *                 speed window has closed (D10) and the timed interval since the last draw
 *                 has passed — it counts down the seconds until then (D13). A
 *                 segmented switch "Host draws" / "Timed draws" (../components/DrawModeSwitch)
 *                 and the seconds between timed draws (shown for timed draws only)
 *                 change at any time over the socket (draw.setMode); the server keeps the
 *                 seconds in the allowed range; seconds below the shortest interval are not sent,
 *                 a plain message says why (D12).
 * Depends on:     react, ../components/DrawModeSwitch, ../game/labels, ../game/socket,
 *                 ../game/useLiveMatch (types), ../playback (types), ../types,
 *                 ../useSecondsUntil, ./TimingFields
 * Used by:        ./HostConsole
 * Spec:           docs/spec/01-game-design.md §5 (D8, D12, D13); docs/spec/06-realtime-architecture.md §4.1
 */
import { useEffect, useState, type ReactElement } from 'react';

import { DrawModeSwitch } from '../components/DrawModeSwitch.js';
import { problemText } from '../game/labels.js';
import { useSecondsUntil } from '../useSecondsUntil.js';
import { intervalProblem } from './TimingFields.js';
import { intent } from '../game/socket.js';
import type { LiveState } from '../game/useLiveMatch.js';
import type { PlaybackView } from '../playback.js';
import type { DomainEventLike } from '../types.js';

// The latest draw's speed window is still open: no speedWindowClosed after it yet.
export function windowOpen(events: readonly DomainEventLike[]): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = events[i]?.type;
    if (type === 'speedWindowClosed' || type === 'roundStarted') return false;
    if (type === 'drawMade') return true;
  }
  return false;
}

// Space draws while focus is not on a field or button (those keep their own Space).
function useSpaceKey(action: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target;
      const onField =
        target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName);
      if (e.code !== 'Space' || onField) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [action]);
}

export function HostDrawControls({
  live,
  view,
}: {
  readonly live: LiveState;
  readonly view: PlaybackView;
}): ReactElement {
  const settings = live.match.settings;
  const [note, setNote] = useState<string | null>(null);
  const hostMode = settings.drawMode === 'host';
  const { canDraw, left, drawNext } = useDrawNext(live, view, setNote);
  const locked = left !== null && left > 0;
  return (
    <section
      className="sbr-panel sbr-stack"
      aria-label="Draw control"
      data-testid="host-draw-controls"
    >
      {/* Draw next exists for host draws only; timed draws need nothing pressed. */}
      {hostMode ? (
        <button
          type="button"
          className="sbr-btn sbr-btn--primary host-draw"
          data-testid="host-draw-next"
          disabled={!canDraw}
          onClick={drawNext}
        >
          {locked ? `Draw next in ${String(left)} s` : 'Draw next'}
        </button>
      ) : null}
      <p className="sbr-muted">{drawHint(hostMode, canDraw, settings.drawIntervalMs)}</p>
      <ModeSwitch
        code={live.match.code}
        settings={settings}
        shortestMs={live.view.drawIntervalRangeMs.min}
        onAnswer={setNote}
      />
      {note !== null ? <p className="lobby-error">{note}</p> : null}
    </section>
  );
}

// Whether Draw next may be pressed now, the seconds until it unlocks (D13), and the press
// itself (also on the Space key).
function useDrawNext(
  live: LiveState,
  view: PlaybackView,
  setNote: (note: string | null) => void,
): { readonly canDraw: boolean; readonly left: number | null; readonly drawNext: () => void } {
  // After a press, Draw next waits until that draw has arrived (the event count grew), so
  // a second press never lands inside the new number's open window (found by the
  // real-game play-through).
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const pending = pressedAt !== null && live.view.events.length <= pressedAt;
  // D13: locked until the next number would have come under timed draws.
  const left = useSecondsUntil(live.match.nextDrawAt);
  const canDraw =
    live.match.settings.drawMode === 'host' &&
    !pending &&
    !(left !== null && left > 0) &&
    !view.roundOver &&
    !view.finished &&
    !windowOpen(live.view.events);
  const drawNext = (): void => {
    if (!canDraw) return;
    setPressedAt(live.view.events.length);
    void intent('draw.next', { code: live.match.code }).then((a) => {
      setNote(a.ok ? null : problemText(a.code));
      if (!a.ok) setPressedAt(null);
    });
  };
  useSpaceKey(drawNext);
  return { canDraw, left, drawNext };
}

// The line under Draw next: how to draw, or why it waits (D13).
function drawHint(hostMode: boolean, canDraw: boolean, intervalMs: number): string {
  const seconds = String(intervalMs / 1000);
  if (!hostMode) {
    return `Numbers are drawn every ${seconds} seconds. Switch to Host draws to draw them yourself.`;
  }
  return canDraw
    ? 'Press Draw next or the Space key.'
    : `Draw next opens ${seconds} seconds after the last number, as with timed draws.`;
}

interface ModeSwitchProps {
  readonly code: string;
  readonly settings: LiveState['match']['settings'];
  // The match's shortest timed-draw interval (D12), from the server.
  readonly shortestMs: number;
  readonly onAnswer: (note: string | null) => void;
}

function ModeSwitch({ code, settings, shortestMs, onAnswer }: ModeSwitchProps): ReactElement {
  const [seconds, setSeconds] = useState(settings.drawIntervalMs / 1000);
  const hostMode = settings.drawMode === 'host';
  const setMode = (mode: 'auto' | 'host', intervalMs?: number): void => {
    // D12: seconds below the shortest interval are not sent; the message says why.
    const problem = intervalMs === undefined ? null : intervalProblem(intervalMs, shortestMs);
    if (problem !== null) {
      onAnswer(problem);
      return;
    }
    const data = { code, mode, ...(intervalMs === undefined ? {} : { intervalMs }) };
    void intent('draw.setMode', data).then((a) => {
      onAnswer(a.ok ? null : problemText(a.code));
    });
  };
  // The seconds field belongs to timed draws and shows only for them.
  return (
    <div className="sbr-stack">
      <DrawModeSwitch
        mode={hostMode ? 'host' : 'auto'}
        testIdPrefix="host-mode"
        onMode={(next) => {
          if (next === 'host') setMode('host');
          else setMode('auto', Math.round(seconds * 1000));
        }}
      />
      {hostMode ? null : (
        <SecondsField
          seconds={seconds}
          onChange={setSeconds}
          onCommit={() => {
            setMode('auto', Math.round(seconds * 1000));
          }}
        />
      )}
    </div>
  );
}

// The seconds between timed draws; sent when the field loses focus.
function SecondsField({
  seconds,
  onChange,
  onCommit,
}: {
  readonly seconds: number;
  readonly onChange: (seconds: number) => void;
  readonly onCommit: () => void;
}): ReactElement {
  return (
    <label className="sbr-row">
      Seconds between timed draws
      <input
        className="sbr-input"
        style={{ width: '6rem' }}
        type="number"
        min={1}
        step={0.5}
        value={seconds}
        data-testid="host-seconds"
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        onBlur={onCommit}
      />
    </label>
  );
}
