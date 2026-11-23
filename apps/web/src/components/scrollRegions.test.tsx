// @vitest-environment jsdom
/**
 * @file   apps/web/src/components/scrollRegions.test.tsx
 * @module web
 * @brief  The regions that scroll on their own can take keyboard focus and have a name.
 *
 * Responsibility: the website sweep's axe rule `scrollable-region-focusable` (WCAG 2.1.1) found
 *                 the drawn numbers (results screens, interludes) and the standings list
 *                 (interlude, console round) scrolling inside the arena without a way for a
 *                 keyboard to reach them (docs/concepts/fit-audit.md §7). The drawn numbers
 *                 are a named region and a tab stop; the standings stay a list (a region role
 *                 would take its items out of it) with a name and a tab stop.
 * Depends on:     @testing-library/react, ./DrawTicker, ./Standings, ../playback,
 *                 ../test/quickTestFixture
 * Spec:           docs/concepts/fit-audit.md §7; WCAG 2.1.1
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawTicker } from './DrawTicker.js';
import { Standings } from './Standings.js';
import { playbackAt } from '../playback.js';
import { royaleFixture } from '../test/quickTestFixture.js';

vi.mock('../game/socket.js', () => ({ intent: () => Promise.resolve({ ok: true }) }));

afterEach(cleanup);

describe('regions that scroll on their own', () => {
  it('the drawn numbers are a named region a keyboard can reach', () => {
    render(<DrawTicker draws={[5, 31, 52]} speedWindowMs={3_000} />);
    const region = screen.getByRole('region', { name: 'Drawn numbers' });
    expect(region).toBe(screen.getByTestId('draw-ticker'));
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('the standings list is a named list a keyboard can reach', () => {
    const result = royaleFixture();
    render(<Standings result={result} view={playbackAt(result, 11)} />);
    const list = screen.getByRole('list', { name: 'Standings rows' });
    expect(list).toBe(screen.getByTestId('standings'));
    expect(list.getAttribute('tabindex')).toBe('0');
  });
});
