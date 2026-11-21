/**
 * @file   apps/web/src/host/asyncTiming.ts
 * @module web/host
 * @brief  Timing of an asynchronous match on the host's side: the time zone, the minutes check.
 *
 * Responsibility: the time zone an asynchronous match's quiet hours are read in (the host's
 *                 browser's, sent with a new match), and the plain message for minutes between
 *                 timed draws outside one minute to one day (01 §5), which the console's draw
 *                 control shows. The quiet hours and the interval of a new match come from its
 *                 preset (admin-area §3); the server checks everything as well.
 * Depends on:     nothing
 * Used by:        ./startForm, ./HostDrawControls
 * Spec:           docs/spec/01-game-design.md §5, §11; docs/concepts/admin-area.md §3
 */

const MAX_MINUTES = 24 * 60;

// The time zone the quiet hours are read in: the host's browser's.
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The plain message for minutes outside one minute to one day (01 §5), or null.
export function minutesProblem(minutes: number): string | null {
  return minutes >= 1 && minutes <= MAX_MINUTES
    ? null
    : `Pick 1 to ${String(MAX_MINUTES)} minutes between draws.`;
}
