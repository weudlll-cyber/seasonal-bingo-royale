// @vitest-environment jsdom
/**
 * @file   apps/web/src/game/seasonsOverview.test.tsx
 * @module web/game
 * @brief  The waiting room's seasons overview: four seasons with the ruleset's numbers, royale only.
 *
 * Responsibility: in a royale the overview lists the four seasons, each with its icon and a
 *                 sentence built from the match's frozen ruleset (the fixture's numbers: ×1.5 for
 *                 8 numbers, +2 per mark for 10, +15 per marked cell in a row, the shield's margin
 *                 and charge) and the Season Complete bonus; a changed ruleset shows its own numbers;
 *                 it is absent in the other two game types (owner decision of 2026-11-25).
 * Depends on:     @testing-library/react, ./SeasonsOverview, ../test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §8.2, §8.3, §13
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SeasonsOverview } from './SeasonsOverview.js';
import { royaleFixture } from '../test/quickTestFixture.js';

afterEach(cleanup);

const text = (season: string): string =>
  screen.getByTestId(`season-overview-${season}`).textContent;

describe('the seasons overview', () => {
  it('lists the four seasons with the ruleset numbers in a royale', () => {
    render(<SeasonsOverview result={royaleFixture()} />);
    const overview = screen.getByTestId('seasons-overview');
    expect(within(overview).getAllByRole('listitem')).toHaveLength(4);
    expect(text('spring')).toContain('Spring growth');
    expect(text('spring')).toContain('more with each mark, for 10 numbers');
    expect(text('spring')).not.toContain('more numbers');
    expect(text('summer')).toContain('Summer boost');
    expect(text('summer')).toContain('count ×1.5 for 8 numbers');
    expect(text('summer')).not.toContain('more numbers');
    expect(text('autumn')).toContain('Autumn harvest: +15 points for each marked cell in your row');
    expect(text('winter')).toContain('Winter shield');
    expect(text('winter')).toContain(
      'saves you once at a cut if you are at most 3 places below the line',
    );
    expect(text('winter')).not.toContain('left');
    expect(screen.getByTestId('season-overview-complete').textContent).toContain(
      'all four give +300 (Season Complete)',
    );
    // Every season has its icon (the status panel's icon, named by the season).
    for (const season of ['spring', 'summer', 'autumn', 'winter'])
      expect(within(screen.getByTestId(`season-overview-${season}`)).getByRole('img')).toBeTruthy();
  });

  it("shows the match's own numbers when the ruleset differs", () => {
    const result = royaleFixture();
    render(
      <SeasonsOverview
        result={{
          ...result,
          seasonCompletePoints: 450,
          seasonEffects: {
            ...result.seasonEffects,
            summer: { type: 'multiplier', factor: 2, durationDraws: 12 },
            winter: { type: 'shield', rankMargin: 1, charges: 2 },
          },
        }}
      />,
    );
    expect(text('summer')).toContain('count ×2 for 12 numbers');
    expect(text('winter')).toContain('saves you 2 times at a cut if you are at most 1 place below');
    expect(text('winter')).not.toContain('left');
    expect(screen.getByTestId('season-overview-complete').textContent).toContain('+450');
  });

  it('is absent in Season-Bingo and Number-Bingo, where seasons have no effect', () => {
    for (const gameType of ['classic', 'classicSeasons'] as const) {
      const { container } = render(
        <SeasonsOverview result={{ ...royaleFixture(), gameType, seasonCompletePoints: 0 }} />,
      );
      expect(screen.queryByTestId('seasons-overview')).toBeNull();
      expect(container.textContent).toBe('');
      cleanup();
    }
  });
});
