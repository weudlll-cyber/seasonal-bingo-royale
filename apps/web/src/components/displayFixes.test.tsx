// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/displayFixes.test.tsx
 * @module web
 * @brief  Display fixes from the owner's screenshots (RUN-4 step 4).
 *
 * Responsibility: eliminated players keep their score at elimination in standings and
 *                 final placement; the owner's rank above the card equals the final place
 *                 once the match is finished; classic types show no seasons, shield or
 *                 effects panel.
 * Depends on:     @testing-library/react, ./DevBadge, ./Playback, ../playback,
 *                 ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §3a, §7.5, §13
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DevBadge } from './DevBadge.js';
import { Playback } from './Playback.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../quickTestFixture.js';

afterEach(cleanup);

describe('display fixes', () => {
  it('(a) an eliminated player keeps the score at elimination in standings and final', () => {
    const result = royaleFixture();
    render(<Playback result={result} view={playbackAt(result, result.events.length)} />);
    expect(screen.getByTestId('standing-owner-01').getAttribute('data-points')).toBe('10');
    const final = screen.getByTestId('final-row-3');
    expect(final.getAttribute('data-account')).toBe('owner-01');
    expect(final.textContent).toContain('10 pts');
  });

  it("(b) once finished, the owner's rank equals the place in the final placement", () => {
    const result = royaleFixture();
    render(<Playback result={result} view={playbackAt(result, result.events.length)} />);
    // Live standings would say #1 (10 pts against two bots reset to 0); the final says #3.
    expect(screen.getByTestId('owner-status-owner-01').textContent).toContain('rank #3');
  });

  it('the dev badge never blocks a control: clicks pass through it', () => {
    render(<DevBadge />);
    const badge = screen.getByTestId('dev-badge');
    expect(badge.textContent).toContain('Bingo · dev · 5390');
    expect(badge.style.pointerEvents).toBe('none');
  });

  it('(c) classic types show no seasons, shield or effects panel', () => {
    const royale = royaleFixture();
    const classic = { ...royale, gameType: 'classic' as const };
    render(<Playback result={classic} view={playbackAt(classic, 6)} />);
    expect(screen.getByTestId('owner-status-owner-01')).toBeTruthy();
    expect(screen.queryByTestId('seasons-collected')).toBeNull();
    expect(screen.queryByTestId('effect-shield')).toBeNull();
    expect(screen.queryByTestId('effect-growth')).toBeNull();
  });
});
