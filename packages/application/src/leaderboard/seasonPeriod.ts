/**
 * @file   packages/application/src/leaderboard/seasonPeriod.ts
 * @module application/leaderboard
 * @brief  The season board's period of a moment: its calendar quarter, named after the season.
 *
 * Responsibility: January–March "Winter YYYY", April–June "Spring YYYY", July–September
 *                 "Summer YYYY", October–December "Autumn YYYY"; start and end (exclusive)
 *                 as epoch ms at the quarter's first instant in UTC. The time comes from the
 *                 caller (the match's finish event), never from a clock here.
 * Depends on:     nothing
 * Used by:        ../index
 * Spec:           docs/spec/01-game-design.md §10; docs/spec/04-database-design.md §3.4
 */

interface SeasonPeriod {
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
}

const QUARTER_NAMES = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;

export function seasonPeriodOf(at: number): SeasonPeriod {
  const d = new Date(at);
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3);
  return {
    name: `${QUARTER_NAMES[quarter] ?? 'Winter'} ${String(year)}`,
    startsAt: Date.UTC(year, quarter * 3, 1),
    // Date.UTC rolls month 12 over into January of the next year.
    endsAt: Date.UTC(year, quarter * 3 + 3, 1),
  };
}
