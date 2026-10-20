// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/markingLabels.test.tsx
 * @module web
 * @brief  Labels that cannot be confused, and the missed-number choice (01 §5, §6, D9).
 *
 * Responsibility: the start form and the live controls name marking, missed numbers and
 *                 draws in words that never use "auto" alone; the form sends the chosen
 *                 missed-number rule and timed-draw gap; when the owner taps, the card
 *                 shows the speed bonus apart from the points with the Quick Test note,
 *                 the limitation is stated, a missed number follows the chosen rule and
 *                 the seasons counter follows the owner's own card.
 * Depends on:     @testing-library/react, ./StartForm, ./DrawControls, ../App,
 *                 ../quickTestFixture, ../drawControl, ../api
 * Spec:           docs/spec/01-game-design.md §5, §6; docs/spec/11-admin-panel.md §3.2
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.js';
import type { StartQuickTestInput } from '../api.js';
import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import { royaleFixture } from '../quickTestFixture.js';
import type { MissedNumbers } from '../types.js';
import { DrawControls } from './DrawControls.js';
import { StartForm } from './StartForm.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const optionTexts = (testId: string): string[] =>
  [...screen.getByTestId(testId).querySelectorAll('option')].map((o) => o.textContent);

function renderForm() {
  const onStart = vi.fn<(input: StartQuickTestInput, draw: DrawControl) => void>();
  render(<StartForm onStart={onStart} busy={false} />);
  return onStart;
}

describe('start form labels', () => {
  it('names marking, missed numbers and draws without the word auto', () => {
    const { container } = render(<StartForm onStart={vi.fn()} busy={false} />);
    expect(optionTexts('marking-mode')).toEqual([
      'Marking: I tap the numbers',
      'Marking: mark for me',
    ]);
    expect(optionTexts('missed-numbers')).toEqual([
      'Missed numbers: mark for me after 3 seconds',
      'Missed numbers: leave open (tap later without bonus)',
    ]);
    expect(optionTexts('start-draw-mode')).toEqual([
      'Draws: timed (every 5 seconds)',
      'Draws: host presses Draw next',
    ]);
    expect(container.textContent).not.toMatch(/\bauto\b/i);
  });

  it('names the chosen seconds and hides missed numbers when marking for the owner', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('missed-delay'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('start-draw-interval'), { target: { value: '8' } });
    expect(optionTexts('missed-numbers')[0]).toBe('Missed numbers: mark for me after 5 seconds');
    expect(optionTexts('start-draw-mode')[0]).toBe('Draws: timed (every 8 seconds)');
    fireEvent.change(screen.getByTestId('marking-mode'), { target: { value: 'auto' } });
    expect(screen.queryByTestId('missed-numbers')).toBeNull();
  });

  it('sends the missed-number rule and the timed-draw gap', () => {
    const onStart = renderForm();
    fireEvent.change(screen.getByTestId('missed-delay'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('start-draw-interval'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('start-run'));
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({
      markingMode: 'manual',
      missedNumbers: { kind: 'autoMarkAfter', delayMs: 5000 },
      drawIntervalMs: 8000,
    });
    fireEvent.change(screen.getByTestId('missed-numbers'), { target: { value: 'noAutoMark' } });
    fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
    fireEvent.click(screen.getByTestId('start-run'));
    const second = onStart.mock.calls[1]?.[0];
    expect(second?.missedNumbers).toEqual({ kind: 'noAutoMark' });
    expect(second).not.toHaveProperty('drawIntervalMs');
  });
});

describe('live draw controls', () => {
  it('reads Timed draws and Host draws, never auto', () => {
    const { container } = render(
      <DrawControls
        control={INITIAL_CONTROL}
        effectiveSec={5}
        canDraw
        onChange={vi.fn()}
        onDrawNext={vi.fn()}
      />,
    );
    expect(screen.getByTestId('draw-mode-timed').textContent).toBe('Timed draws');
    expect(screen.getByTestId('draw-mode-host').textContent).toBe('Host draws');
    expect(container.textContent).not.toMatch(/\bauto\b/i);
  });
});

// The page with a mocked server result, host draws so time passes without new draws.
async function startHostRun(missed: MissedNumbers): Promise<void> {
  vi.useFakeTimers();
  const result = royaleFixture('manual', missed);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(result)))),
  );
  render(<App />);
  fireEvent.change(screen.getByTestId('start-draw-mode'), { target: { value: 'host' } });
  fireEvent.click(screen.getByTestId('start-run'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  fireEvent.click(screen.getByTestId('draw-next')); // draw 1: number 1 at cell 0 (spring)
}

const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const cell0 = () => screen.getByTestId('owner-cell-0').getAttribute('data-marked');

describe('the owner taps (Quick Test)', () => {
  it('states the limitation and shows the speed bonus apart from the points', async () => {
    await startHostRun({ kind: 'autoMarkAfter', delayMs: 5000 });
    expect(screen.getByTestId('quicktest-limitation').textContent).toContain(
      'computed on the server before playback',
    );
    expect(screen.getByTestId('owner-bonus').textContent).toBe(
      '+0 speed bonus (not counted in Quick Test cuts)',
    );
  });

  it('marks a missed number after the chosen 5 s, not after 3 s', async () => {
    await startHostRun({ kind: 'autoMarkAfter', delayMs: 5000 });
    await wait(4_900);
    expect(cell0()).toBe('false');
    await wait(100);
    expect(cell0()).toBe('true');
  });

  it('leaves a missed number open and lets a later tap mark it without bonus', async () => {
    await startHostRun({ kind: 'noAutoMark' });
    await wait(30_000);
    expect(cell0()).toBe('false');
    expect(screen.getByTestId('seasons-collected').textContent).toMatch(/0\/4/);
    fireEvent.click(screen.getByTestId('owner-cell-0'));
    expect(cell0()).toBe('true');
    expect(screen.getByTestId('owner-feedback').textContent).toBe('Marked late · no speed bonus');
    // The seasons counter follows the owner's own card: spring is now marked.
    expect(screen.getByTestId('seasons-collected').textContent).toMatch(/1\/4/);
  });
});
