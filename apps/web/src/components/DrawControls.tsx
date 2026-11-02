/**
 * @file   apps/web/src/components/DrawControls.tsx
 * @module web
 * @brief  Live draw control of the seed simulation (D8): Draw next, timed/host switch, seconds.
 *
 * Responsibility: styled like the host console's control (../host/HostDrawControls, host.css):
 *                 a big "Draw next" (usable in host mode while draws remain), a line on how
 *                 numbers come, the "Host draws" / "Timed draws" switch (./DrawModeSwitch), the
 *                 seconds between timed draws (timed draws only) and "Skip to end". Labels never
 *                 use the word "auto" alone, so they cannot be confused with marking. Purely
 *                 controls; the rules live in ../drawControl.
 * Depends on:     react, ../drawControl, ./DrawModeSwitch, ../host/host.css
 * Used by:        ../quicktest/Simulation
 * Spec:           docs/spec/01-game-design.md §5, docs/spec/11-admin-panel.md §3.2
 */
import type { ReactElement } from 'react';

import type { DrawControl } from '../drawControl.js';
import '../host/host.css';
import { DrawModeSwitch } from './DrawModeSwitch.js';

interface DrawControlsProps {
  readonly control: DrawControl;
  // The interval actually in use, in seconds (the ruleset's when none was set).
  readonly effectiveSec: number;
  readonly canDraw: boolean;
  readonly onChange: (next: DrawControl) => void;
  readonly onDrawNext: () => void;
}

export function DrawControls(props: DrawControlsProps): ReactElement {
  const { control, effectiveSec, canDraw, onChange, onDrawNext } = props;
  const hostMode = control.mode === 'host';
  return (
    <section className="sbr-panel sbr-stack" role="group" aria-label="Draw control">
      <button
        type="button"
        className="sbr-btn sbr-btn--primary host-draw"
        data-testid="draw-next"
        disabled={!hostMode || !canDraw}
        onClick={onDrawNext}
      >
        Draw next
      </button>
      <p className="sbr-muted">
        {hostMode
          ? 'Press Draw next for each number.'
          : `Numbers are drawn every ${String(effectiveSec)} seconds. Switch to Host draws to draw them yourself.`}
      </p>
      <DrawModeSwitch
        mode={control.mode}
        testIdPrefix="draw-mode"
        onMode={(mode) => {
          onChange({ ...control, mode });
        }}
      />
      {hostMode ? null : (
        <label className="sbr-row">
          Seconds between timed draws
          <input
            className="sbr-input"
            style={{ width: '6rem' }}
            type="number"
            data-testid="draw-interval"
            min={1}
            step={0.5}
            value={effectiveSec}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value) && value > 0) onChange({ ...control, intervalSec: value });
            }}
          />
        </label>
      )}
      <button
        type="button"
        className="sbr-btn"
        onClick={() => {
          onChange({ ...control, skipped: true });
        }}
      >
        Skip to end
      </button>
    </section>
  );
}
