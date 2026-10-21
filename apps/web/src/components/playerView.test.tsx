// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/playerView.test.tsx
 * @module web
 * @brief  Component tests for the player view items of WP-08 (01 §13).
 *
 * Responsibility: original season icons with season colours on season cells and effect
 *                 badges; the cut screen after each cut; the owner's effects with
 *                 remaining draws, shield charges and seasons collected; the spectator
 *                 view continuing after elimination.
 * Depends on:     @testing-library/react, ./CardGrid, ./CutScreen, ./OwnerStatusPanel,
 *                 ./Playback, ../playback, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §7, §8.2, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CardGrid } from './CardGrid.js';
import { CutScreen } from './CutScreen.js';
import { OwnerStatusPanel } from './OwnerStatusPanel.js';
import { Playback } from './Playback.js';
import { playbackAt } from '../playback.js';
import { numberCard, royaleFixture } from '../quickTestFixture.js';

afterEach(cleanup);

const SPRING_RGB = 'rgb(175, 184, 78)'; // #afb84e
const WINTER_RGB = 'rgb(4, 170, 247)'; // #04aaf7

describe('season cells', () => {
  it('show the original season icon file and a frame in the season colour', () => {
    render(<CardGrid accountId="bot-02" card={numberCard(0)} marks={[]} />);
    const icon = screen.getAllByAltText('spring')[0];
    expect(icon?.getAttribute('src')).toMatch(/assets\/seasons\/spring\.svg/);
    expect(icon?.parentElement?.parentElement?.style.border).toContain(SPRING_RGB);
    const winter = screen.getAllByAltText('winter');
    expect(winter).toHaveLength(1);
    expect(winter[0]?.getAttribute('src')).toMatch(/assets\/seasons\/winter\.svg/);
  });

  it('show a classicSeasons symbol as its icon on the card, framed in its season colour', () => {
    const card = numberCard(0);
    const cells = card.cells.map((c, i) =>
      i === 24 ? { kind: 'symbol' as const, value: 104 } : c,
    );
    render(<CardGrid accountId="bot-02" card={{ ...card, cells }} marks={[]} />);
    // The icon has its own season colour, so the cell keeps the card colour behind it.
    const box = screen.getByAltText('winter').parentElement;
    expect(box?.style.background).toBe('var(--cell-bg, var(--color-surface-2))');
    expect(box?.style.border).toBe(`2px solid ${WINTER_RGB}`);
  });
});

describe('OwnerStatusPanel', () => {
  it('shows active effects with remaining draws, shield charges and seasons collected', () => {
    render(
      <OwnerStatusPanel
        accountId="owner-01"
        points={120}
        rank={2}
        status={{
          step: 1,
          multiplier: { factor: 1.5, remainingDraws: 6 },
          growth: { pointsPerMark: 2, remainingDraws: 4 },
          shieldCharges: 1,
          seasons: ['spring', 'summer'],
        }}
        effectSeasons={{ multiplier: 'summer', growth: 'spring', shield: 'winter' }}
        showSeasons
        outInCut={null}
      />,
    );
    expect(screen.getByTestId('effect-multiplier').textContent).toContain('×1.5 · 6 draws left');
    expect(screen.getByTestId('effect-growth').textContent).toContain('4 draws left');
    expect(screen.getByTestId('effect-shield').textContent).toContain('shield ×1');
    expect(screen.getByTestId('effect-shield').style.background).toBe(WINTER_RGB);
    expect(screen.getByTestId('seasons-collected').textContent).toContain('2/4');
    expect(within(screen.getByTestId('effect-growth')).getByAltText('spring')).toBeTruthy();
  });

  it('says "Out in cut N" instead of effects, shield and seasons once the owner is out', () => {
    render(
      <OwnerStatusPanel
        accountId="owner-01"
        points={120}
        rank={9}
        status={{
          step: 1,
          multiplier: { factor: 1.5, remainingDraws: 6 },
          growth: { pointsPerMark: 2, remainingDraws: 4 },
          shieldCharges: 1,
          seasons: ['spring', 'summer'],
        }}
        effectSeasons={{ multiplier: 'summer', growth: 'spring', shield: 'winter' }}
        showSeasons
        outInCut={2}
      />,
    );
    expect(screen.getByTestId('owner-out').textContent).toBe('Out in cut 2');
    expect(screen.queryByTestId('effect-multiplier')).toBeNull();
    expect(screen.queryByTestId('effect-growth')).toBeNull();
    expect(screen.queryByTestId('effect-shield')).toBeNull();
    expect(screen.queryByTestId('seasons-collected')).toBeNull();
  });
});

describe('CutScreen', () => {
  const cut = (n: number, outcome: 'survived' | 'saved' | 'eliminated') => ({
    number: n,
    owners: [{ accountId: 'owner-01', outcome }],
  });

  it('tells a survivor when the next round starts, an eliminated owner the cut they went out in', () => {
    const nextRoundAt = Date.now() + 6_000;
    const { rerender } = render(<CutScreen cut={cut(1, 'survived')} nextRoundAt={nextRoundAt} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain(
      "You're through — next round in 6 s",
    );
    expect(screen.queryByText('Watch')).toBeNull();
    fireEvent.click(screen.getByText('Keep playing'));
    expect(screen.queryByTestId('cut-screen')).toBeNull();
    rerender(<CutScreen cut={cut(2, 'eliminated')} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain(
      "You're out in cut 2 — you can keep watching",
    );
    expect(screen.getByText('Watch')).toBeTruthy();
  });

  it('brings a new cut into view', () => {
    const scroll = vi.fn();
    // jsdom has no scrollIntoView: lend one for this test and take it back after.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scroll,
      configurable: true,
    });
    const { rerender } = render(<CutScreen cut={cut(1, 'survived')} />);
    rerender(<CutScreen cut={cut(2, 'eliminated')} />);
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it('names a Winter shield save', () => {
    render(<CutScreen cut={cut(1, 'saved')} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain('saved by your Winter shield');
  });
});

describe('spectator view', () => {
  it('keeps playing after the owner is eliminated, to the final placement', () => {
    const result = royaleFixture();
    const { rerender } = render(<Playback result={result} view={playbackAt(result, 11)} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain("You're out in cut 1");
    expect(screen.getByTestId('spectator-note')).toBeTruthy();
    rerender(<Playback result={result} view={playbackAt(result, result.events.length)} />);
    expect(screen.getByTestId('final-placement')).toBeTruthy();
    // Ranked rows: name, points, the collected season lit, "out", own row highlighted.
    const row = screen.getByTestId('standing-owner-01');
    expect(row.className).toBe('rank-row is-own is-out');
    expect(row.textContent).toContain('10 pts');
    expect(row.textContent).toContain('out');
    expect(
      within(row)
        .getAllByRole('img')
        .filter((i) => i.style.opacity === '1'),
    ).toHaveLength(1);
    const own = screen.getByTestId('final-own').textContent;
    const ownRow = screen
      .getAllByTestId(/^final-row-/)
      .find((r) => r.getAttribute('data-account') === 'owner-01');
    expect(own).toBe(`You finished #${String(ownRow?.getAttribute('data-place'))} of 3`);
    expect(ownRow?.textContent).toContain('10 pts');
  });
});
