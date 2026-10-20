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
 * Depends on:     @testing-library/react, ./Playback, ../playback, ../quickTestFixture
 * Spec:           docs/spec/01-game-design.md §3a, §7.5, §13
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Playback } from './Playback.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../quickTestFixture.js';

afterEach(cleanup);

describe('display fixes', () => {
  it('(a) an eliminated player keeps the score at elimination in standings and final', () => {
    const result = royaleFixture();
    render(<Playback result={result} view={playbackAt(result, result.events.length)} />);
    expect(screen.getByTestId('standings').textContent).toContain('owner-01 — 10 pts');
    expect(screen.getByTestId('final-placement').textContent).toContain(
      '#3 owner-01 — 10 pts · out',
    );
  });

  it("(b) once finished, the owner's rank equals the place in the final placement", () => {
    const result = royaleFixture();
    render(<Playback result={result} view={playbackAt(result, result.events.length)} />);
    // Live standings would say #1 (10 pts against two bots reset to 0); the final says #3.
    expect(screen.getByTestId('owner-status-owner-01').textContent).toContain('rank #3');
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
