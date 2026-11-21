// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/drawControls.test.tsx
 * @module web
 * @brief  Draw control components (D8): start-form choice and live controls.
 *
 * Responsibility: Draw next works only in `host` mode and while draws remain; the mode
 *                 switch, the interval field and skip report the new control; the start
 *                 form passes mode and interval (empty = ruleset interval).
 * Depends on:     @testing-library/react, ./DrawControls, ./StartDrawField, ../drawControl,
 *                 ../test/matchFixture
 * Spec:           docs/spec/01-game-design.md §5, docs/spec/11-admin-panel.md §3.2
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawControls } from './DrawControls.js';
import { StartDrawField } from './StartDrawField.js';
import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import { showWithLimits } from '../test/matchFixture.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function controls(control: DrawControl, canDraw = true) {
  const onChange = vi.fn<(next: DrawControl) => void>();
  const onDrawNext = vi.fn<() => void>();
  render(
    <DrawControls
      control={control}
      effectiveSec={5}
      canDraw={canDraw}
      onChange={onChange}
      onDrawNext={onDrawNext}
    />,
  );
  return { onChange, onDrawNext };
}

describe('DrawControls', () => {
  it('enables Draw next only in host mode with draws left', () => {
    controls(INITIAL_CONTROL);
    expect(screen.getByTestId('draw-next')).toHaveProperty('disabled', true);
    cleanup();
    const { onDrawNext } = controls({ ...INITIAL_CONTROL, mode: 'host' });
    fireEvent.click(screen.getByTestId('draw-next'));
    expect(onDrawNext).toHaveBeenCalledTimes(1);
    cleanup();
    controls({ ...INITIAL_CONTROL, mode: 'host' }, false);
    expect(screen.getByTestId('draw-next')).toHaveProperty('disabled', true);
  });

  it('switches mode, sets the interval and skips at any time', () => {
    const { onChange } = controls(INITIAL_CONTROL);
    fireEvent.click(screen.getByTestId('draw-mode-host'));
    fireEvent.change(screen.getByTestId('draw-interval'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByText('Skip to end'));
    expect(onChange.mock.calls.map(([c]) => c)).toEqual([
      { ...INITIAL_CONTROL, mode: 'host' },
      { ...INITIAL_CONTROL, intervalSec: 2.5 },
      { ...INITIAL_CONTROL, skipped: true },
    ]);
  });
});

describe('StartDrawField', () => {
  it('passes the mode and the interval; an empty interval means the ruleset interval', async () => {
    const onChange = vi.fn<(next: DrawControl) => void>();
    // The ruleset interval it names comes from the server's limits (the session answer).
    await showWithLimits(
      <StartDrawField value={{ ...INITIAL_CONTROL, intervalSec: 3 }} onChange={onChange} />,
    );
    fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
    fireEvent.change(screen.getByTestId('start-draw-interval'), { target: { value: '' } });
    expect(onChange.mock.calls.map(([c]) => c)).toEqual([
      { ...INITIAL_CONTROL, mode: 'host', intervalSec: 3 },
      { ...INITIAL_CONTROL, intervalSec: null },
    ]);
  });
});
