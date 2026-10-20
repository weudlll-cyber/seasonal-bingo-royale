/**
 * @file   apps/web/src/components/StartDrawField.tsx
 * @module web
 * @brief  Start-form choice of draw control (D8): `auto` with an interval, or `host`.
 *
 * Responsibility: pick the draw mode before the run and, for `auto`, the seconds between
 *                 draws; left empty, the ruleset interval applies (clamped to its allowed
 *                 range by ../drawControl). The host can change both during play.
 * Depends on:     react, ../drawControl
 * Used by:        ./StartForm
 * Spec:           docs/spec/01-game-design.md §5, docs/spec/11-admin-panel.md §3.2
 */
import type { ReactElement } from 'react';

import type { DrawControl, DrawMode } from '../drawControl.js';

export interface StartDrawFieldProps {
  readonly value: DrawControl;
  readonly onChange: (next: DrawControl) => void;
}

export function StartDrawField({ value, onChange }: StartDrawFieldProps): ReactElement {
  return (
    <fieldset
      style={{ border: '1px solid #223', padding: '0.5rem', display: 'grid', gap: '0.4rem' }}
    >
      <legend>Draws</legend>
      <select
        data-testid="start-draw-mode"
        aria-label="Draw mode"
        value={value.mode}
        onChange={(e) => {
          onChange({ ...value, mode: e.target.value as DrawMode });
        }}
      >
        <option value="auto">auto (after an interval)</option>
        <option value="host">host (you press Draw next)</option>
      </select>
      <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span>Seconds between auto draws</span>
        <input
          type="number"
          data-testid="start-draw-interval"
          min={1}
          step={0.5}
          placeholder="ruleset"
          value={value.intervalSec ?? ''}
          onChange={(e) => {
            const seconds = Number(e.target.value);
            onChange({
              ...value,
              intervalSec: e.target.value === '' || seconds <= 0 ? null : seconds,
            });
          }}
          style={{ width: '5rem' }}
        />
      </label>
    </fieldset>
  );
}
