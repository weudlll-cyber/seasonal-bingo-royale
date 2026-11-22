// @vitest-environment jsdom
/**
 * @file   apps/web/src/admin/units.test.tsx
 * @module web/admin
 * @brief  Units read in the singular for 1: "1 day", "1 hour", "1 try", "+1 point".
 *
 * Responsibility: a value in its unit (the admin area's built-in values, limits and the
 *                 History), the unit beside a value's input, and a correction of league points
 *                 say one thing in the singular and many in the plural; abbreviations ("s",
 *                 "min", "h", "%") stay as they are.
 * Depends on:     @testing-library/react, ../game/labels, ./presetText, ./ValueField
 * Spec:           docs/concepts/admin-area.md §4
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { pointsDelta, unitFor } from '../game/labels.js';
import { shownValue } from './presetText.js';
import { ValueField } from './ValueField.js';

afterEach(cleanup);

describe('units in the singular for 1', () => {
  it('names one of a counted unit in the singular, many in the plural', () => {
    expect(shownValue(1, 'days')).toBe('1 day');
    expect(shownValue(1, 'hours')).toBe('1 hour');
    expect(shownValue(1, 'tries')).toBe('1 try');
    expect(shownValue(1, 'matches')).toBe('1 match');
    expect(shownValue(1, 'sign-ups')).toBe('1 sign-up');
    expect(shownValue(2, 'tries')).toBe('2 tries');
    expect(shownValue(1_000, 'min', 1_000)).toBe('1 min');
    expect(unitFor(1, 's')).toBe('s');
    expect(pointsDelta(1)).toBe('+1 point');
    expect(pointsDelta(-20)).toBe('−20 points');
  });

  it('puts the singular beside an input holding 1', () => {
    render(
      <ValueField
        idPrefix="technical"
        field={{
          path: 'playerIdleDays',
          label: 'Player session, idle',
          description: 'd',
          kind: 'number',
          unit: 'days',
          scale: 1,
          min: 1,
          max: 30,
          value: 1,
          default: 7,
        }}
        value={1}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByTestId('technical-playerIdleDays').textContent).toContain('day');
    expect(screen.getByTestId('technical-playerIdleDays').textContent).not.toMatch(/1\s*days/);
  });
});
