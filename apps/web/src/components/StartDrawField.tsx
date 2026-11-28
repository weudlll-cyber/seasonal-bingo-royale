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
 * Depends on:     react, ../drawControl, ../shell/session (the ruleset interval it names)
 * Used by:        ./StartForm, ../quicktest/TestMatch
 * Spec:           docs/spec/01-game-design.md §5, docs/spec/11-admin-panel.md §3.2
 */
import type { ReactElement } from 'react';

import type { DrawControl, DrawMode } from '../drawControl.js';
import { useLimits } from '../shell/session.js';

interface StartDrawFieldProps {
  readonly value: DrawControl;
  readonly onChange: (next: DrawControl) => void;
}

export function StartDrawField({ value, onChange }: StartDrawFieldProps): ReactElement | null {
  // The realtime rulesets' interval as the server sends it: the label names it while the
  // field is empty and that interval applies (admin-area §8 (m)).
  const rulesetMs = useLimits()?.drawIntervalMs;
  if (rulesetMs === undefined) return null;
  const seconds = value.intervalSec ?? rulesetMs / 1000;
  return (
    <fieldset>
      <legend>Draws</legend>
      <select
        className="sk-select"
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
      <label className="sbr-row">
        <span>Seconds between timed draws</span>
        <input
          className="sk-input"
          type="number"
          data-testid="start-draw-interval"
          min={1}
          step={0.5}
          placeholder={String(rulesetMs / 1000)}
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
