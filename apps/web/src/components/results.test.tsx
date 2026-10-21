// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/results.test.tsx
 * @module web
 * @brief  Ranked rows, divider, podium, empty match log and the host's draw switch (POLISH-1).
 *
 * Responsibility: standings show players still in above a divider and the out rows
 *                 below it, dimmed with "out", each with four season icons; the final
 *                 placement states the owner's place and puts places 1–3 on a podium; the
 *                 match log is hidden while empty; the host's draw-mode switch marks the
 *                 active mode and shows the seconds field for timed draws only.
 * Depends on:     @testing-library/react, vitest, ./Standings, ./FinalPlacement, ./Playback,
 *                 ../host/HostDrawControls, ../playback, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §5, §7.5, §13
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawTicker } from './DrawTicker.js';
import { FinalPlacement } from './FinalPlacement.js';
import { MatchLog } from './Playback.js';
import { Standings } from './Standings.js';
import type { LiveState } from '../game/useLiveMatch.js';
import { HostDrawControls } from '../host/HostDrawControls.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../quickTestFixture.js';

vi.mock('../game/socket.js', () => ({ intent: () => Promise.resolve({ ok: true }) }));

afterEach(cleanup);

describe('ranked rows', () => {
  it('lists players still in, a divider, then the out rows dimmed with "out"', () => {
    const result = royaleFixture();
    // After the cut: owner-01 is out, both bots go on.
    render(<Standings view={playbackAt(result, 11)} showSeasons />);
    const items = [...screen.getByTestId('standings').children];
    expect(items.map((li) => li.getAttribute('data-testid') ?? li.textContent)).toEqual([
      'standing-bot-02',
      'standing-bot-03',
      'Out of the match',
      'standing-owner-01',
    ]);
    const out = screen.getByTestId('standing-owner-01');
    expect(out.className).toContain('is-out');
    expect(within(out).getByText('out')).toBeTruthy();
    expect(within(out).getAllByRole('img')).toHaveLength(4);
  });

  it("states the owner's place big and puts places 1–3 on a podium", () => {
    const result = royaleFixture();
    const view = playbackAt(result, result.events.length);
    render(<FinalPlacement result={result} view={view} />);
    expect(screen.getByTestId('final-own').textContent).toBe('You finished #3 of 3');
    const podium = document.querySelectorAll('.podium-step');
    expect([...podium].map((s) => s.getAttribute('data-place'))).toEqual(['1', '2', '3']);
    expect(podium[2]?.className).toContain('is-own');
  });

  it('names a season draw in the ticker next to its icon', () => {
    render(<DrawTicker draws={[5, 104]} speedWindowMs={3000} />);
    expect(screen.getByTestId('draw-ticker').textContent).toBe('B 5Winter');
    expect(screen.getByAltText('winter')).toBeTruthy();
  });

  it('hides the match log while it is empty', () => {
    const { container } = render(<MatchLog banners={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe("the host's draw-mode switch", () => {
  const live = (drawMode: 'auto' | 'host') =>
    ({
      match: {
        code: 'SW1',
        settings: {
          markingMode: 'manual',
          missedNumbers: { kind: 'noAutoMark' },
          drawMode,
          drawIntervalMs: 5000,
        },
      },
      view: { events: [] },
    }) as unknown as LiveState;

  it('marks the active mode; seconds for timed draws, Draw next for host draws only', () => {
    const view = playbackAt(royaleFixture(), 0);
    const { rerender } = render(<HostDrawControls live={live('host')} view={view} />);
    expect(screen.getByTestId('host-mode-host').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('host-mode-host').textContent).toBe('✓ Host draws');
    expect(screen.getByTestId('host-mode-timed').getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByTestId('host-seconds')).toBeNull();
    expect(screen.getByTestId('host-draw-next')).toBeTruthy();
    rerender(<HostDrawControls live={live('auto')} view={view} />);
    expect(screen.getByTestId('host-mode-timed').textContent).toBe('✓ Timed draws');
    expect(screen.getByTestId('host-seconds')).toBeTruthy();
    // Timed draws need nothing pressed: no Draw next at all.
    expect(screen.queryByTestId('host-draw-next')).toBeNull();
  });
});
