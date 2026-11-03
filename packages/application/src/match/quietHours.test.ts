/**
 * @file   packages/application/src/match/quietHours.test.ts
 * @module application/match
 * @brief  Quiet hours in the match's time zone: inside or not, and when they end (01 §5).
 *
 * Responsibility: a plain window (00:00–07:00) and one past midnight (22:00–06:00) in UTC
 *                 and in Europe/Berlin; start inclusive, end exclusive; the end on the days
 *                 the clocks change (spring gap and autumn repeat); an unknown time zone.
 * Depends on:     ./quietHours
 * Spec:           docs/spec/01-game-design.md §5
 */
import { describe, expect, it } from 'vitest';

import { isTimeZone, outsideQuietHours, quietHoursEnd } from './quietHours.js';

const utc = (iso: string): number => Date.parse(`${iso}Z`);
const NIGHT = { startHour: 0, endHour: 7 };
const LATE = { startHour: 22, endHour: 6 };

describe('quietHoursEnd', () => {
  it('is null outside the window and the window end inside it (UTC)', () => {
    expect(quietHoursEnd(utc('2026-06-10T07:00:00'), NIGHT, 'UTC')).toBeNull();
    expect(quietHoursEnd(utc('2026-06-10T23:59:59'), NIGHT, 'UTC')).toBeNull();
    expect(quietHoursEnd(utc('2026-06-10T00:00:00'), NIGHT, 'UTC')).toBe(
      utc('2026-06-10T07:00:00'),
    );
    expect(quietHoursEnd(utc('2026-06-10T06:59:59'), NIGHT, 'UTC')).toBe(
      utc('2026-06-10T07:00:00'),
    );
  });

  it('wraps past midnight: the end is on the next day when the window began today', () => {
    expect(quietHoursEnd(utc('2026-06-10T22:30:00'), LATE, 'UTC')).toBe(utc('2026-06-11T06:00:00'));
    expect(quietHoursEnd(utc('2026-06-11T03:00:00'), LATE, 'UTC')).toBe(utc('2026-06-11T06:00:00'));
    expect(quietHoursEnd(utc('2026-06-10T21:59:00'), LATE, 'UTC')).toBeNull();
  });

  it('reads the hours in the match time zone (Berlin summer time is UTC+2)', () => {
    // 23:30 UTC is 01:30 in Berlin: quiet until 07:00 Berlin = 05:00 UTC.
    expect(quietHoursEnd(utc('2026-06-10T23:30:00'), NIGHT, 'Europe/Berlin')).toBe(
      utc('2026-06-11T05:00:00'),
    );
    // 05:00 UTC is 07:00 in Berlin: no longer quiet.
    expect(quietHoursEnd(utc('2026-06-11T05:00:00'), NIGHT, 'Europe/Berlin')).toBeNull();
  });

  it('ends at the first hour after the spring gap when the end hour does not exist', () => {
    // 2026-03-29 in Berlin: 02:00 CET jumps to 03:00 CEST (01:00 UTC).
    const window = { startHour: 0, endHour: 2 };
    expect(quietHoursEnd(utc('2026-03-29T00:30:00'), window, 'Europe/Berlin')).toBe(
      utc('2026-03-29T01:00:00'),
    );
  });

  it('ends at the first 03:00 on the autumn night the hour repeats', () => {
    // 2026-10-25 in Berlin: 03:00 CEST (01:00 UTC) falls back to 02:00 CET.
    const window = { startHour: 0, endHour: 3 };
    expect(quietHoursEnd(utc('2026-10-24T23:00:00'), window, 'Europe/Berlin')).toBe(
      utc('2026-10-25T02:00:00'),
    );
    const early = { startHour: 0, endHour: 2 };
    // 02:00 CEST comes first (00:00 UTC); from then on the local hour is 2, not quiet.
    expect(quietHoursEnd(utc('2026-10-24T23:00:00'), early, 'Europe/Berlin')).toBe(
      utc('2026-10-25T00:00:00'),
    );
  });

  it('has no window when start and end are the same hour', () => {
    expect(quietHoursEnd(utc('2026-06-10T05:00:00'), { startHour: 5, endHour: 5 }, 'UTC')).toBe(
      null,
    );
  });
});

describe('outsideQuietHours', () => {
  it('keeps a time outside the window and moves one inside to its end', () => {
    const noon = utc('2026-06-10T12:00:00');
    expect(outsideQuietHours(noon, NIGHT, 'UTC')).toBe(noon);
    expect(outsideQuietHours(utc('2026-06-10T03:00:00'), NIGHT, 'UTC')).toBe(
      utc('2026-06-10T07:00:00'),
    );
    expect(outsideQuietHours(utc('2026-06-10T03:00:00'), null, 'UTC')).toBe(
      utc('2026-06-10T03:00:00'),
    );
  });
});

describe('isTimeZone', () => {
  it('accepts IANA names and refuses anything else', () => {
    expect(isTimeZone('Europe/Berlin')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});
