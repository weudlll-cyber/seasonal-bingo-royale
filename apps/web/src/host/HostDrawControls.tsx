/**
 * @file   apps/web/src/host/HostDrawControls.tsx
 * @module web/host
 * @brief  The host's draw control in a live match: Draw next, timed/host switch, seconds (D8).
 *
 * Responsibility: a big "Draw next" for host draws, also on the Space key while no field
 *                 has focus; it is usable only while the round runs and the previous
 *                 number's speed window has closed (D10: windows never overlap). "Timed
 *                 draws" / "Host draws" and the seconds between timed draws change at any
 *                 time over the socket (draw.setMode); the server keeps the seconds in the
 *                 allowed range.
 * Depends on:     react, ../game/socket, ../game/useLiveMatch (types), ../playback (types), ../types
 * Used by:        ./HostConsole
 * Spec:           docs/spec/01-game-design.md §5; docs/spec/06-realtime-architecture.md §4.1
 */
import { useEffect, useState, type ReactElement } from 'react';

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
  const code = live.match.code;
  const settings = live.match.settings;
  const [note, setNote] = useState<string | null>(null);
  const hostMode = settings.drawMode === 'host';
  // After a press, Draw next waits until that draw has arrived (the event count grew), so
  // a second press never lands inside the new number's open window (found by the
  // real-game play-through).
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const pending = pressedAt !== null && live.view.events.length <= pressedAt;
  const canDraw =
    hostMode && !pending && !view.roundOver && !view.finished && !windowOpen(live.view.events);
  const drawNext = (): void => {
    if (!canDraw) return;
    setPressedAt(live.view.events.length);
    void intent('draw.next', { code }).then((a) => {
      setNote(a.ok ? null : a.code);
      if (!a.ok) setPressedAt(null);
    });
  };
  useSpaceKey(drawNext);
  return (
    <section
      className="sbr-panel sbr-stack"
      aria-label="Draw control"
      data-testid="host-draw-controls"
    >
      <button
        type="button"
        className="sbr-btn sbr-btn--primary host-draw"
        data-testid="host-draw-next"
        disabled={!canDraw}
        onClick={drawNext}
      >
        Draw next
      </button>
      <p className="sbr-muted">
        {hostMode
          ? canDraw
            ? 'Press Draw next or the Space key.'
            : 'Draw next opens when the speed window of the last number has closed.'
          : `Timed draws every ${String(settings.drawIntervalMs / 1000)} seconds.`}
      </p>
      <ModeSwitch code={code} settings={settings} onAnswer={setNote} />
      {note !== null ? <p className="lobby-error">{note}</p> : null}
    </section>
  );
}

interface ModeSwitchProps {
  readonly code: string;
  readonly settings: LiveState['match']['settings'];
  readonly onAnswer: (note: string | null) => void;
}

function ModeSwitch({ code, settings, onAnswer }: ModeSwitchProps): ReactElement {
  const [seconds, setSeconds] = useState(settings.drawIntervalMs / 1000);
  const hostMode = settings.drawMode === 'host';
  const setMode = (mode: 'auto' | 'host', intervalMs?: number): void => {
    const data = { code, mode, ...(intervalMs === undefined ? {} : { intervalMs }) };
    void intent('draw.setMode', data).then((a) => {
      onAnswer(a.ok ? null : a.code);
    });
  };
  return (
    <div className="sbr-row" role="group" aria-label="Draw mode">
      <button
        type="button"
        className="sbr-btn"
        aria-pressed={!hostMode}
        data-testid="host-mode-timed"
        onClick={() => {
          setMode('auto', Math.round(seconds * 1000));
        }}
      >
        Timed draws
      </button>
      <button
        type="button"
        className="sbr-btn"
        aria-pressed={hostMode}
        data-testid="host-mode-host"
        onClick={() => {
          setMode('host');
        }}
      >
        Host draws
      </button>
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
            setSeconds(Number(e.target.value));
          }}
          onBlur={() => {
            if (!hostMode) setMode('auto', Math.round(seconds * 1000));
          }}
        />
      </label>
    </div>
  );
}
