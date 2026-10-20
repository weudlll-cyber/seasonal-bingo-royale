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
import { afterEach, describe, expect, it } from 'vitest';

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

  it('show a classicSeasons symbol as the icon on its season colour', () => {
    const card = numberCard(0);
    const cells = card.cells.map((c, i) =>
      i === 24 ? { kind: 'symbol' as const, value: 104 } : c,
    );
    render(<CardGrid accountId="bot-02" card={{ ...card, cells }} marks={[]} />);
    const box = screen.getByAltText('winter').parentElement;
    expect(box?.style.background).toBe(WINTER_RGB);
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
        eliminated={false}
      />,
    );
    expect(screen.getByTestId('effect-multiplier').textContent).toContain('×1.5 · 6 draws left');
    expect(screen.getByTestId('effect-growth').textContent).toContain('4 draws left');
    expect(screen.getByTestId('effect-shield').textContent).toContain('shield ×1');
    expect(screen.getByTestId('effect-shield').style.background).toBe(WINTER_RGB);
    expect(screen.getByTestId('seasons-collected').textContent).toContain('2/4');
    expect(within(screen.getByTestId('effect-growth')).getByAltText('spring')).toBeTruthy();
  });

  it('shows nothing active once the owner is eliminated; seasons stay collected', () => {
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
        eliminated
      />,
    );
    expect(screen.queryByTestId('effect-multiplier')).toBeNull();
    expect(screen.queryByTestId('effect-growth')).toBeNull();
    expect(screen.getByTestId('effect-shield').textContent).toContain('shield ×0');
    expect(screen.getByTestId('seasons-collected').textContent).toContain('2/4');
  });
});

describe('CutScreen', () => {
  const cut = (n: number, outcome: 'survived' | 'saved' | 'eliminated') => ({
    number: n,
    owners: [{ accountId: 'owner-01', outcome }],
  });

  it('reads "You survived" or "Eliminated – keep watching" and closes on request', () => {
    const { rerender } = render(<CutScreen cut={cut(1, 'survived')} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain('You survived');
    fireEvent.click(screen.getByText('Keep watching'));
    expect(screen.queryByTestId('cut-screen')).toBeNull();
    rerender(<CutScreen cut={cut(2, 'eliminated')} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain('Eliminated – keep watching');
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
    expect(screen.getByTestId('cut-screen').textContent).toContain('Eliminated – keep watching');
    expect(screen.getByTestId('spectator-note')).toBeTruthy();
    rerender(<Playback result={result} view={playbackAt(result, result.events.length)} />);
    expect(screen.getByTestId('final-placement')).toBeTruthy();
    expect(screen.getByTestId('standings').textContent).toContain(
      'owner-01 — 10 pts · seasons 1 · out',
    );
    expect(screen.getByTestId('final-placement').textContent).toContain('owner-01 — 10 pts · out');
  });
});
