/**
 * @file   apps/web/src/components/DrawControls.tsx
 * @module web
 * @brief  Live draw controls of the Quick Test (D8): mode switch, interval, Draw next, skip.
 *
 * Responsibility: let the host switch between `auto` and `host` at any time, set the
 *                 `auto` interval in seconds, draw the next item in `host` mode and skip
 *                 to the end. Purely controls; the rules live in ../drawControl.
 * Depends on:     react, ../drawControl
 * Used by:        ../App
 * Spec:           docs/spec/01-game-design.md §5, docs/spec/11-admin-panel.md §3.2
 */
import type { ReactElement } from 'react';

import type { DrawControl, DrawMode } from '../drawControl.js';

export interface DrawControlsProps {
  readonly control: DrawControl;
  // The interval actually in use, in seconds (the ruleset's when none was set).
  readonly effectiveSec: number;
  readonly canDraw: boolean;
  readonly onChange: (next: DrawControl) => void;
  readonly onDrawNext: () => void;
}

export function DrawControls(props: DrawControlsProps): ReactElement {
  const { control, effectiveSec, canDraw, onChange, onDrawNext } = props;
  return (
    <div
      role="group"
      aria-label="Draw control"
      style={{ marginTop: '0.75rem', display: 'grid', gap: '0.4rem' }}
    >
      <ModeSwitch
        mode={control.mode}
        onMode={(mode) => {
          onChange({ ...control, mode });
        }}
      />
      <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span>Seconds between auto draws</span>
        <input
          type="number"
          data-testid="draw-interval"
          min={1}
          step={0.5}
          value={effectiveSec}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (Number.isFinite(value) && value > 0) onChange({ ...control, intervalSec: value });
          }}
          style={{ width: '4.5rem' }}
        />
      </label>
      <div>
        <button
          type="button"
          data-testid="draw-next"
          disabled={control.mode !== 'host' || !canDraw}
          onClick={onDrawNext}
          style={buttonStyle(false)}
        >
          Draw next
        </button>
        <button
          type="button"
          onClick={() => {
            onChange({ ...control, skipped: true });
          }}
          style={buttonStyle(false)}
        >
          skip to end
        </button>
      </div>
    </div>
  );
}

function ModeSwitch({
  mode,
  onMode,
}: {
  mode: DrawMode;
  onMode: (next: DrawMode) => void;
}): ReactElement {
  return (
    <div>
      {(['auto', 'host'] as const).map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`draw-mode-${option}`}
          aria-pressed={mode === option}
          onClick={() => {
            onMode(option);
          }}
          style={buttonStyle(mode === option)}
        >
          {option === 'auto' ? 'auto draws' : 'host draws'}
        </button>
      ))}
    </div>
  );
}

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.35rem 0.65rem',
    marginRight: '0.3rem',
    background: active ? '#2a3a56' : '#1a2130',
    color: '#e6edf7',
    border: active ? '1px solid #3b73c8' : '1px solid #223',
    borderRadius: '0.3rem',
    cursor: 'pointer',
  };
}
