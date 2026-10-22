/**
 * @file   apps/web/src/components/StartDrawField.tsx
 * @module web
 * @brief  Start-form choice of draw control (D8): timed draws every N seconds, or host draws.
 *
 * Responsibility: pick the draw mode before the run — under "Draws", "Timed (every N
 *                 seconds)" or "Host presses Draw next" — and, for timed draws, the seconds
 *                 between draws (left empty, the ruleset interval applies; clamped to
 *                 the allowed range by ../drawControl). The host can change both during
 *                 play. Labels never use the word "auto" alone, so they cannot be
 *                 confused with marking.
 * Depends on:     react, ../drawControl
 * Used by:        ./StartForm
 * Spec:           docs/spec/01-game-design.md §5, docs/spec/11-admin-panel.md §3.2
 */
import type { ReactElement } from 'react';

import type { DrawControl, DrawMode } from '../drawControl.js';

// The realtime rulesets draw every 5 s (packages/contracts/src/config/defaults); the
// label names it while the field is empty and the ruleset interval applies.
const RULESET_INTERVAL_SEC = 5;

export interface StartDrawFieldProps {
  readonly value: DrawControl;
  readonly onChange: (next: DrawControl) => void;
}

export function StartDrawField({ value, onChange }: StartDrawFieldProps): ReactElement {
  const seconds = value.intervalSec ?? RULESET_INTERVAL_SEC;
  return (
    <fieldset
      style={{
        border: '1px solid var(--color-border)',
        padding: '0.5rem',
        display: 'grid',
        gap: '0.4rem',
      }}
    >
      <legend>Draws</legend>
      <select
        className="sbr-select"
        data-testid="start-draw-mode"
        aria-label="Draws"
        value={value.mode}
        onChange={(e) => {
          onChange({ ...value, mode: e.target.value as DrawMode });
        }}
      >
        <option value="auto">Timed (every {String(seconds)} seconds)</option>
        <option value="host">Host presses Draw next</option>
      </select>
      <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span>Seconds between timed draws</span>
        <input
          className="sbr-input"
          type="number"
          data-testid="start-draw-interval"
          min={1}
          step={0.5}
          placeholder={String(RULESET_INTERVAL_SEC)}
          value={value.intervalSec ?? ''}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange({
              ...value,
              intervalSec: e.target.value === '' || next <= 0 ? null : next,
            });
          }}
          style={{ width: '5rem' }}
        />
      </label>
    </fieldset>
  );
}
