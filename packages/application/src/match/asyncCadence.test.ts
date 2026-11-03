/**
 * @file   packages/application/src/match/asyncCadence.test.ts
 * @module application/match
 * @brief  When the next draw of an asynchronous match is due: cadence, quiet hours, catch-up.
 *
 * Responsibility: on time the next draw is one interval after the planned one, moved out of
 *                 quiet hours; after downtime the missed draws come every catch-up interval,
 *                 at most the cap of them, and never inside quiet hours; once caught up the
 *                 normal cadence resumes (01 §5, 06 §6).
 * Depends on:     ./asyncCadence
 * Spec:           docs/spec/01-game-design.md §5; docs/spec/06-realtime-architecture.md §6
 */
import { describe, expect, it } from 'vitest';

import { firstAsyncDraw, nextAsyncDraw, type Cadence } from './asyncCadence.js';

const utc = (iso: string): number => Date.parse(`${iso}Z`);
const MIN = 60_000;
const CATCH_UP = { intervalMs: 2_000, maxDraws: 75 };
const cadence: Cadence = {
  intervalMs: 15 * MIN,
  quietHours: { startHour: 0, endHour: 7 },
  timeZone: 'UTC',
};

describe('firstAsyncDraw', () => {
  it('is one interval away, or the end of the quiet hours it falls into', () => {
    const noon = utc('2026-06-10T12:00:00');
    expect(firstAsyncDraw(noon, cadence)).toBe(noon + 15 * MIN);
    expect(firstAsyncDraw(utc('2026-06-10T23:50:00'), cadence)).toBe(utc('2026-06-11T07:00:00'));
  });
});

describe('nextAsyncDraw', () => {
  it('keeps the cadence from the planned time when on time', () => {
    const planned = utc('2026-06-10T12:00:00');
    const next = nextAsyncDraw({
      plannedAt: planned,
      drawnAt: planned + 40,
      now: planned + 3_040,
      cadence,
      catchUp: CATCH_UP,
    });
    expect(next).toEqual({ dueAt: planned + 15 * MIN, plannedAt: planned + 15 * MIN });
  });

  it('moves a draw planned inside the quiet hours to their end', () => {
    const planned = utc('2026-06-10T23:50:00');
    const next = nextAsyncDraw({
      plannedAt: planned,
      drawnAt: planned,
      now: planned + 3_000,
      cadence,
      catchUp: CATCH_UP,
    });
    expect(next.dueAt).toBe(utc('2026-06-11T07:00:00'));
    expect(next.plannedAt).toBe(utc('2026-06-11T07:00:00'));
  });
});

describe('nextAsyncDraw after downtime', () => {
  it('catches up missed draws at the catch-up pace', () => {
    const planned = utc('2026-06-10T12:00:00');
    const back = planned + 60 * MIN;
    const next = nextAsyncDraw({
      plannedAt: planned,
      drawnAt: back,
      now: back + 3_000,
      cadence,
      catchUp: CATCH_UP,
    });
    // The window close (3 s) is later than the catch-up pace (2 s): due at once.
    expect(next).toEqual({ dueAt: back + 3_000, plannedAt: planned + 15 * MIN });
  });

  it('drops missed draws beyond the cap', () => {
    const planned = utc('2026-06-08T12:00:00');
    const now = utc('2026-06-10T12:00:00');
    const next = nextAsyncDraw({
      plannedAt: planned,
      drawnAt: now - 3_000,
      now,
      cadence: { ...cadence, quietHours: null },
      catchUp: CATCH_UP,
    });
    expect(next.dueAt).toBe(now);
    expect(next.plannedAt).toBe(now - 75 * 15 * MIN);
  });

  it('resumes the normal cadence once caught up', () => {
    const now = utc('2026-06-10T12:00:00');
    const next = nextAsyncDraw({
      plannedAt: now - 10 * MIN,
      drawnAt: now - 3_000,
      now,
      cadence,
      catchUp: CATCH_UP,
    });
    expect(next).toEqual({ dueAt: now + 5 * MIN, plannedAt: now + 5 * MIN });
  });

  it('makes no catch-up draw inside the quiet hours', () => {
    const now = utc('2026-06-10T02:00:00');
    const next = nextAsyncDraw({
      plannedAt: utc('2026-06-09T20:00:00'),
      drawnAt: now - 3_000,
      now,
      cadence,
      catchUp: CATCH_UP,
    });
    expect(next.dueAt).toBe(utc('2026-06-10T07:00:00'));
  });
});
