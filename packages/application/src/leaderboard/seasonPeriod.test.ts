/**
 * @file   packages/application/src/leaderboard/seasonPeriod.test.ts
 * @module application/leaderboard
 * @brief  The season board's period: the calendar quarter of a match's finish, named after its season.
 *
 * Responsibility: January–March is "Winter", April–June "Spring", July–September "Summer",
 *                 October–December "Autumn", each with its year; start and end are the
 *                 quarter's first instants in UTC (end exclusive), also at the edges.
 * Depends on:     ./seasonPeriod
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/04-database-design.md §3.4
 */
import { describe, expect, it } from 'vitest';

import { seasonPeriodOf } from './seasonPeriod.js';

const at = (iso: string) => Date.parse(iso);

describe('the season period of a finish time (01 §10)', () => {
  it('names each quarter after its season', () => {
    const names = ['2027-02-10', '2027-05-01', '2027-08-31', '2027-11-30'].map(
      (d) => seasonPeriodOf(at(`${d}T12:00:00Z`)).name,
    );
    expect(names).toEqual(['Winter 2027', 'Spring 2027', 'Summer 2027', 'Autumn 2027']);
  });

  it("starts at the quarter's first instant and ends where the next begins", () => {
    expect(seasonPeriodOf(at('2026-12-31T23:59:59.999Z'))).toEqual({
      name: 'Autumn 2026',
      startsAt: at('2026-10-01T00:00:00Z'),
      endsAt: at('2027-01-01T00:00:00Z'),
    });
    expect(seasonPeriodOf(at('2027-01-01T00:00:00Z')).name).toBe('Winter 2027');
    expect(seasonPeriodOf(at('2027-04-01T00:00:00Z')).startsAt).toBe(at('2027-04-01T00:00:00Z'));
  });
});
