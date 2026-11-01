// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/playerView.test.tsx
 * @module web
 * @brief  Component tests for the player view items of WP-08 (01 §13).
 *
 * Responsibility: original season icons with season colours on season cells and effect
 *                 lines; the cut screen after each cut (a shield save with its margin); the
 *                 owner's effects as plain sentences with the season's name and the numbers
 *                 of the ruleset, the shield's margin and charges, a used shield, the seasons
 *                 of the match by name; the spectator view continuing after elimination.
 * Depends on:     @testing-library/react, ./CardGrid, ./CutScreen, ./OwnerStatusPanel,
 *                 ./Playback, ../playback, ../test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §7, §8.2, §13; docs/spec/15-implementation-plan.md WP-08
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CardGrid } from './CardGrid.js';
import { CutScreen } from './CutScreen.js';
import { OwnerStatusPanel } from './OwnerStatusPanel.js';
import { Playback } from './Playback.js';
import { playbackAt } from '../playback.js';
import { numberCard, royaleFixture, SEASON_EFFECTS } from '../test/quickTestFixture.js';

afterEach(cleanup);

const SPRING = 'var(--color-spring)';
const WINTER = 'var(--color-winter)';

describe('season cells', () => {
  it('show the original season icon file and a frame in the season colour', () => {
    render(<CardGrid accountId="bot-02" card={numberCard(0)} marks={[]} />);
    const icon = screen.getAllByAltText('spring')[0];
    expect(icon?.getAttribute('src')).toMatch(/assets\/seasons\/spring\.svg/);
    expect(icon?.parentElement?.parentElement?.style.border).toContain(SPRING);
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
    expect(box?.style.border).toBe(`2px solid ${WINTER}`);
  });
});

const RULES = {
  effectSeasons: { multiplier: 'summer', growth: 'spring', shield: 'winter' },
  seasonEffects: SEASON_EFFECTS,
  seasonCompletePoints: 300,
} as const;
const STATUS = {
  step: 1,
  multiplier: { factor: 1.5, remainingDraws: 6 },
  growth: { pointsPerMark: 2, remainingDraws: 4 },
  shieldCharges: 1,
  seasons: ['spring', 'summer'] as const,
};

describe('OwnerStatusPanel', () => {
  it('says each active effect in a sentence with its season and the ruleset numbers', () => {
    render(
      <OwnerStatusPanel
        accountId="owner-01"
        points={120}
        rank={2}
        status={STATUS}
        rules={RULES}
        showSeasons
        outInCut={null}
        shieldSaves={[]}
      />,
    );
    expect(screen.getByTestId('effect-multiplier').textContent).toBe(
      'Summer boost: all your points count ×1.5 — 6 more numbers',
    );
    expect(screen.getByTestId('effect-growth').textContent).toBe(
      'Spring growth: every mark earns extra points, more with each mark — 4 more numbers',
    );
    expect(screen.getByTestId('effect-shield').textContent).toBe(
      'Winter shield: saves you once at a cut if you are at most 3 places below the line — 1 left',
    );
    expect(within(screen.getByTestId('effect-shield')).getByAltText('winter')).toBeTruthy();
    expect(within(screen.getByTestId('effect-growth')).getByAltText('spring')).toBeTruthy();
  });

  it('names the seasons of the match, collected ones ticked, and what all four give', () => {
    render(
      <OwnerStatusPanel
        accountId="owner-01"
        points={120}
        rank={2}
        status={STATUS}
        rules={RULES}
        showSeasons
        outInCut={null}
        shieldSaves={[]}
      />,
    );
    const seasons = screen.getByTestId('seasons-collected');
    expect(seasons.dataset['count']).toBe('2');
    expect(seasons.textContent).toContain(
      'Seasons this match: Spring ✓ · Summer ✓ · Autumn – · Winter –',
    );
    expect(seasons.textContent).toContain('all four give +300 (Season Complete)');
    expect(screen.getByTestId('seasons-note').textContent).toBe(
      'Seasons count over the whole match.',
    );
  });
});

describe('OwnerStatusPanel: the shield and elimination', () => {
  it('says when the shield was used, and shows no empty shield', () => {
    render(
      <OwnerStatusPanel
        accountId="owner-01"
        points={120}
        rank={2}
        status={{ ...STATUS, shieldCharges: 0 }}
        rules={RULES}
        showSeasons
        outInCut={null}
        shieldSaves={[{ cut: 1, placesBelow: 2 }]}
      />,
    );
    expect(screen.queryByTestId('effect-shield')).toBeNull();
    expect(screen.getByTestId('shield-saved').textContent).toBe(
      'Your Winter shield saved you in cut 1 (you were 2 places below the line)',
    );
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
        rules={RULES}
        showSeasons
        outInCut={2}
        shieldSaves={[]}
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
    round: n - 1,
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

  it('names a Winter shield save and how far below the line the owner was', () => {
    const saved = {
      number: 1,
      round: 0,
      owners: [{ accountId: 'owner-01', outcome: 'saved' as const, placesBelow: 2 }],
    };
    render(<CutScreen cut={saved} />);
    expect(screen.getByTestId('cut-screen').textContent).toContain(
      "You're through — your Winter shield saved you in cut 1 (you were 2 places below the line)",
    );
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
