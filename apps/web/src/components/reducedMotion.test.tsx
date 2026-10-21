// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/reducedMotion.test.tsx
 * @module web
 * @brief  Every Quick Test animation respects prefers-reduced-motion (01 §13).
 *
 * Responsibility: with `prefers-reduced-motion: reduce` no component adds an animation
 *                 class (cut screen, banners, newest draw, tapped cell); without it they
 *                 do; motion.css switches all animations off under the same query.
 * Depends on:     @testing-library/react, ./CutScreen, ./DrawTicker, ./OwnerCard,
 *                 ./Playback, ../playback, ../quickTestFixture, ../motion.css
 * Spec:           docs/spec/01-game-design.md §13
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CutScreen } from './CutScreen.js';
import { DrawTicker } from './DrawTicker.js';
import { OwnerCard } from './OwnerCard.js';
import { Playback } from './Playback.js';
import motionCss from '../motion.css?raw';
import { playbackAt } from '../playback.js';
import { numberCard, royaleFixture } from '../quickTestFixture.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function preferReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

function renderAnimatedParts(): void {
  const result = royaleFixture('manual');
  render(<Playback result={result} view={playbackAt(result, 11)} />);
  render(<DrawTicker draws={[1, 2]} speedWindowMs={3000} />);
  render(
    <OwnerCard
      accountId="owner-01"
      card={numberCard(0)}
      serverMarks={[]}
      result={result}
      drawsSoFar={[1]}
      roundOver={false}
    />,
  );
  fireEvent.click(screen.getAllByTestId('owner-cell-0').at(-1) as HTMLElement);
}

const animated = (): Element[] => [...document.querySelectorAll('[class*="sbr-anim-"]')];

describe('prefers-reduced-motion', () => {
  it('adds no animation class anywhere when the viewer prefers reduced motion', () => {
    preferReducedMotion(true);
    renderAnimatedParts();
    expect(screen.getAllByTestId('cut-screen').length).toBeGreaterThan(0);
    expect(animated()).toHaveLength(0);
  });

  it('animates the cut screen, banners, newest draw and the tapped cell otherwise', () => {
    preferReducedMotion(false);
    renderAnimatedParts();
    const classes = animated().map((el) => el.getAttribute('data-testid') ?? el.tagName);
    expect(classes).toEqual(
      expect.arrayContaining(['cut-screen', 'LI', 'draw-newest', 'owner-cell-0']),
    );
  });

  it('switches every animation off in CSS under the same media query', () => {
    expect(motionCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*animation: none !important/,
    );
  });

  it('shows a cut screen without animation as well', () => {
    preferReducedMotion(true);
    render(
      <CutScreen cut={{ number: 1, owners: [{ accountId: 'owner-01', outcome: 'survived' }] }} />,
    );
    expect(screen.getByTestId('cut-screen').className).toBe('cut-screen');
  });
});
