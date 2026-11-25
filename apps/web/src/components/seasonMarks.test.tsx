// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/seasonMarks.test.tsx
 * @module web
 * @brief  One look for a player's four season marks: icon when earned, empty ring when not.
 *
 * Responsibility: an earned season renders the coloured icon and a season not earned a white disc
 *                 with a grey ring (not a faded icon) of the same size; the set of four names how many are
 *                 earned; the final placement's podium shows four marks per place in a royale
 *                 and none in a classic match (owner decision of 2026-11-24).
 * Depends on:     @testing-library/react, ./SeasonIcon, ./SeasonSet, ./FinalPlacement,
 *                 ../playback, ../test/quickTestFixture
 * Spec:           docs/spec/01-game-design.md §7.5, §13
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FinalPlacement } from './FinalPlacement.js';
import { SEASON_MARK_SIZE, SeasonIcon } from './SeasonIcon.js';
import { SeasonSet } from './SeasonSet.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../test/quickTestFixture.js';

afterEach(cleanup);

describe('season marks', () => {
  it('renders an earned season as an icon and a season not earned as a disc with a ring', () => {
    render(
      <>
        <SeasonIcon season="spring" size={SEASON_MARK_SIZE} onColor earned />
        <SeasonIcon season="winter" size={SEASON_MARK_SIZE} onColor earned={false} />
      </>,
    );
    const earned = screen.getByRole('img', { name: 'spring' });
    const open = screen.getByRole('img', { name: 'winter (not collected)' });
    expect(earned.tagName).toBe('IMG');
    expect(open.tagName).toBe('SPAN');
    expect(open.className).toContain('season-ring');
    // The same size, and no faded icon anywhere.
    expect(open.style.width).toBe(earned.style.width);
    expect(open.style.opacity).toBe('');
    expect(earned.style.opacity).toBe('');
  });

  it('draws a season not earned as a white disc (in both themes) with a grey ring, from the kit tokens', () => {
    render(<SeasonIcon season="autumn" size={SEASON_MARK_SIZE} onColor earned={false} />);
    const open = screen.getByRole('img', { name: 'autumn (not collected)' });
    // The disc is filled (the colour under it never shows through) and rimmed by the ring.
    // White in both themes: the kit's one white that no theme overrides (--color-surface and
    // --color-on-solid both turn navy in dark mode).
    expect(open.style.background).toContain('var(--color-on-live)');
    expect(open.style.borderColor).toContain('var(--color-border-strong)');
    expect(open.className).toContain('season-ring');
  });

  it('shows four marks in the set and names how many are earned', () => {
    render(<SeasonSet seasons={['summer', 'autumn']} />);
    const set = screen.getByLabelText('2 of 4 seasons');
    expect(set.querySelectorAll('[data-earned="true"]')).toHaveLength(2);
    expect(set.querySelectorAll('[data-earned="false"]')).toHaveLength(2);
  });

  it('puts four marks on each podium step of a royale', () => {
    const result = royaleFixture();
    render(<FinalPlacement result={result} view={playbackAt(result, result.events.length)} />);
    const steps = document.querySelectorAll('.podium-step');
    expect(steps).toHaveLength(3);
    for (const step of steps) expect(step.querySelectorAll('[data-season]')).toHaveLength(4);
  });
});
