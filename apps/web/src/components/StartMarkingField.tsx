/**
 * @file   apps/web/src/components/StartMarkingField.tsx
 * @module web
 * @brief  Start-form choice of marking and of the missed-number rule (01 §6, D9).
 *
 * Responsibility: "Marking: I tap the numbers" or "Marking: mark for me"; when the owner
 *                 taps, a second choice for missed numbers: marked for the owner after N
 *                 seconds (default 3) or left open to be tapped later without bonus.
 *                 Labels never use the word "auto" alone, so they cannot be confused
 *                 with the draw control.
 * Depends on:     react, ../types
 * Used by:        ./StartForm
 * Spec:           docs/spec/01-game-design.md §6, docs/spec/11-admin-panel.md §3.2
 */
import type { ReactElement } from 'react';

import type { MarkingMode, MissedNumbers } from '../types.js';

export interface MarkingChoice {
  readonly mode: MarkingMode;
  readonly missed: MissedNumbers['kind'];
  // Seconds before a missed number is marked for the owner under autoMarkAfter.
  readonly delaySec: number;
}

export const INITIAL_MARKING: MarkingChoice = {
  mode: 'manual',
  missed: 'autoMarkAfter',
  delaySec: 3,
};

// The request value; the server raises a delay below the speed window to the window.
export function toMissedNumbers(choice: MarkingChoice): MissedNumbers {
  if (choice.missed === 'noAutoMark') return { kind: 'noAutoMark' };
  const seconds = Number.isFinite(choice.delaySec) ? choice.delaySec : INITIAL_MARKING.delaySec;
  return {
    kind: 'autoMarkAfter',
    delayMs: Math.min(60_000, Math.max(0, Math.round(seconds * 1000))),
  };
}

export interface StartMarkingFieldProps {
  readonly value: MarkingChoice;
  readonly onChange: (next: MarkingChoice) => void;
}

export function StartMarkingField({ value, onChange }: StartMarkingFieldProps): ReactElement {
  return (
    <fieldset style={fieldsetStyle}>
      <legend>Marking</legend>
      <select
        data-testid="marking-mode"
        aria-label="Marking"
        value={value.mode}
        onChange={(e) => {
          onChange({ ...value, mode: e.target.value as MarkingMode });
        }}
      >
        <option value="manual">Marking: I tap the numbers</option>
        <option value="auto">Marking: mark for me</option>
      </select>
      {value.mode === 'manual' ? <MissedField value={value} onChange={onChange} /> : null}
    </fieldset>
  );
}

function MissedField({ value, onChange }: StartMarkingFieldProps): ReactElement {
  return (
    <>
      <select
        data-testid="missed-numbers"
        aria-label="Missed numbers"
        value={value.missed}
        onChange={(e) => {
          onChange({ ...value, missed: e.target.value as MissedNumbers['kind'] });
        }}
      >
        <option value="autoMarkAfter">
          Missed numbers: mark for me after {String(value.delaySec)} seconds
        </option>
        <option value="noAutoMark">Missed numbers: leave open (tap later without bonus)</option>
      </select>
      {value.missed === 'autoMarkAfter' ? (
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <span>Seconds before a missed number is marked for me</span>
          <input
            type="number"
            data-testid="missed-delay"
            min={0}
            step={0.5}
            value={value.delaySec}
            onChange={(e) => {
              onChange({ ...value, delaySec: Number(e.target.value) });
            }}
            style={{ width: '5rem' }}
          />
        </label>
      ) : null}
    </>
  );
}

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid #223',
  padding: '0.5rem',
  display: 'grid',
  gap: '0.4rem',
};
