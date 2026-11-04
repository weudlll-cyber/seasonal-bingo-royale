/**
 * @file   packages/application/src/match/quietHours.ts
 * @module application/match
 * @brief  Quiet hours of an asynchronous match in its IANA time zone (01 §5).
 *
 * Responsibility: whether a moment lies inside the quiet hours (whole hours, start
 *                 inclusive, end exclusive, a start after the end wraps past midnight) and
 *                 when they end: the first moment the local clock shows the end hour, or, on
 *                 a spring night that skips it, the first moment after the gap. Pure: the
 *                 time zone rules come from the runtime's Intl data, the moment is passed in.
 * Depends on:     @sbr/contracts (types)
 * Used by:        ./asyncCadence, ./create, ../index
 * Spec:           docs/spec/01-game-design.md §5
 */
import type { QuietHours } from '@sbr/contracts';

const HOUR_MS = 3_600_000;

interface Wall {
  readonly y: number;
  readonly mo: number;
  readonly d: number;
  readonly h: number;
  readonly mi: number;
  readonly s: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

// The local wall clock of a moment in the time zone.
function wallOf(at: number, timeZone: string): Wall {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(at)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    y: parts.year ?? 0,
    mo: parts.month ?? 1,
    d: parts.day ?? 1,
    h: parts.hour ?? 0,
    mi: parts.minute ?? 0,
    s: parts.second ?? 0,
  };
}

// Local time minus UTC at a moment, in ms.
function offsetAt(at: number, timeZone: string): number {
  const w = wallOf(at, timeZone);
  const second = at - (((at % 1000) + 1000) % 1000);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - second;
}

function inside(hour: number, q: QuietHours): boolean {
  if (q.startHour < q.endHour) return hour >= q.startHour && hour < q.endHour;
  if (q.startHour > q.endHour) return hour >= q.startHour || hour < q.endHour;
  return false;
}

// The first moment whose local clock reads `hour`:00 on the day of `wall` (a local time
// written as if it were UTC). Both offsets around it are tried: on the autumn night the
// hour exists twice (the earlier one wins); on the spring night it is skipped, and the
// moment after the gap is taken.
function firstLocal(wall: number, hour: number, timeZone: string): number {
  const candidates = [
    wall - offsetAt(wall - 12 * HOUR_MS, timeZone),
    wall - offsetAt(wall + 12 * HOUR_MS, timeZone),
  ];
  const valid = candidates.filter((t) => {
    const w = wallOf(t, timeZone);
    return w.h === hour && w.mi === 0;
  });
  return valid.length > 0 ? Math.min(...valid) : Math.max(...candidates);
}

// Null outside the quiet hours; inside, the moment they end.
export function quietHoursEnd(at: number, q: QuietHours, timeZone: string): number | null {
  const w = wallOf(at, timeZone);
  if (!inside(w.h, q)) return null;
  // Past midnight in a wrapping window the end is today; before midnight it is tomorrow.
  const nextDay = q.startHour > q.endHour && w.h >= q.startHour ? 1 : 0;
  return firstLocal(Date.UTC(w.y, w.mo - 1, w.d + nextDay, q.endHour), q.endHour, timeZone);
}

// The moment itself, or the end of the quiet hours it falls into (no quiet hours: as is).
export function outsideQuietHours(at: number, q: QuietHours | null, timeZone: string): number {
  return q === null ? at : (quietHoursEnd(at, q, timeZone) ?? at);
}

// An IANA time zone name the runtime knows ("Europe/Berlin", "UTC").
export function isTimeZone(name: string): boolean {
  if (name === '') return false;
  try {
    formatter(name);
    return true;
  } catch {
    return false;
  }
}
