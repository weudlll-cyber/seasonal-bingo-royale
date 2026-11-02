// @vitest-environment jsdom
/**
 * @file   apps/web/src/quicktest/simulation.test.tsx
 * @module web/quicktest
 * @brief  The seed simulation's layout: the form folds after a run, one draw control at a time.
 *
 * Responsibility: before a run only the form (with its draw choice) shows; after Run the form
 *                 folds to one line with game type and seed, and only the live draw control
 *                 remains; "Change settings" reopens the form (same values) and hides the live
 *                 control, "Back to the run" folds it again.
 * Depends on:     @testing-library/react, ./Simulation, ../test/quickTestFixture
 * Spec:           docs/spec/15-implementation-plan.md WP-08; docs/spec/01-game-design.md §5
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { royaleFixture } from '../test/quickTestFixture.js';
import { Simulation } from './Simulation.js';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(royaleFixture('manual'))))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Draw controls a person can see: the form's draw choice when the form is open, the live one.
function visibleDrawControls(): string[] {
  const formOpen = screen.getByTestId('start-run').closest('[hidden]') === null;
  return [
    ...(formOpen ? ['form'] : []),
    ...(screen.queryByTestId('draw-next') === null ? [] : ['live']),
  ];
}

describe('the seed simulation', () => {
  it('folds the form after a run and shows exactly one draw control', async () => {
    render(<Simulation />);
    expect(visibleDrawControls()).toEqual(['form']);
    fireEvent.click(screen.getByTestId('start-run'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(visibleDrawControls()).toEqual(['live']);
    expect(screen.getByTestId('simulation-summary').textContent).toContain(
      'Classic with seasons · seed spring-garden',
    );
    fireEvent.click(screen.getByTestId('simulation-change'));
    expect(visibleDrawControls()).toEqual(['form']);
    expect(screen.getByTestId<HTMLInputElement>('seed').value).toBe('spring-garden');
    fireEvent.click(screen.getByTestId('simulation-change'));
    expect(visibleDrawControls()).toEqual(['live']);
  });
});
