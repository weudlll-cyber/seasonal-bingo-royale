/**
 * @file   apps/web/src/types.test.ts
 * @module web
 * @brief  The season symbol mapping and the ball labels of the client (WP-08, D7).
 *
 * Responsibility: classicSeasons draw items 101–104 map to spring, summer, autumn,
 *                 winter (04 §3.4); every number carries its column letter.
 * Depends on:     ./types
 * Spec:           docs/spec/15-implementation-plan.md WP-08, docs/spec/04-database-design.md
 */
import { describe, expect, it } from 'vitest';

import { ballLabel, seasonOfSymbol } from './types.js';

describe('client display helpers', () => {
  it('maps the four season symbol ids in season order and nothing else', () => {
    expect([101, 102, 103, 104].map(seasonOfSymbol)).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
    ]);
    expect(seasonOfSymbol(75)).toBeNull();
    expect(seasonOfSymbol(105)).toBeNull();
  });

  it('labels each number with its column letter at the range edges (D7)', () => {
    expect([1, 15, 16, 30, 31, 45, 46, 60, 61, 75].map(ballLabel)).toEqual([
      'B 1',
      'B 15',
      'I 16',
      'I 30',
      'N 31',
      'N 45',
      'G 46',
      'G 60',
      'O 61',
      'O 75',
    ]);
    expect(ballLabel(102)).toBe('Summer');
  });
});
