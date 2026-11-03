/**
 * @file   apps/web/src/host/AsyncFields.tsx
 * @module web/host
 * @brief  The create form's pace: live, or asynchronous with minutes and quiet hours (01 §5, §11).
 *
 * Responsibility: the "Pace" choice for a battle royale (live, or asynchronous: numbers
 *                 minutes or hours apart, everyone marked automatically); for asynchronous
 *                 matches the draw control (timed or host), the minutes between timed draws
 *                 (1 to 1440, empty for the ruleset's 15) and the quiet hours (on by default
 *                 with the ruleset's 00:00–07:00) in the browser's time zone, named on screen;
 *                 the request fields and the plain message for minutes out of range. The
 *                 server checks all of it as well. Every option fits a 390 px phone.
 * Depends on:     react, @sbr/contracts, ../drawControl
 * Used by:        ./CreateMatch, ./createForm, ./HostDrawControls (minutesProblem)
 * Spec:           docs/spec/01-game-design.md §5, §6, §11
 */
import { royaleAsyncDefault } from '@sbr/contracts';
import type { ReactElement } from 'react';

import type { DrawControl, DrawMode } from '../drawControl.js';

interface QuietChoice {
  readonly startHour: number;
  readonly endHour: number;
}

export type PaceChoice =
  | { readonly kind: 'realtime' }
  | {
      readonly kind: 'async';
      // Minutes between timed draws; null for the ruleset's interval.
      readonly minutes: number | null;
      // null: no quiet hours.
      readonly quiet: QuietChoice | null;
    };

const RULESET_MINUTES = royaleAsyncDefault.draws.intervalMsAsync / 60_000;
const RULESET_QUIET: QuietChoice = royaleAsyncDefault.draws.quietHours ?? {
  startHour: 0,
  endHour: 7,
};
const MAX_MINUTES = 24 * 60;

export const INITIAL_PACE: PaceChoice = { kind: 'realtime' };
const INITIAL_ASYNC: PaceChoice = { kind: 'async', minutes: null, quiet: RULESET_QUIET };

// The time zone the quiet hours are read in: the host's browser's.
const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The request fields of an asynchronous match (05 §2.3).
export function asyncBody(pace: Extract<PaceChoice, { kind: 'async' }>) {
  return {
    mode: 'async' as const,
    ...(pace.minutes === null ? {} : { drawIntervalMs: Math.round(pace.minutes * 60_000) }),
    quietHours: pace.quiet,
    timeZone: browserTimeZone(),
  };
}

// The plain message for minutes outside one minute to one day (01 §5), or null.
export function minutesProblem(pace: PaceChoice): string | null {
  if (pace.kind !== 'async' || pace.minutes === null) return null;
  return pace.minutes >= 1 && pace.minutes <= MAX_MINUTES
    ? null
    : `Pick 1 to ${String(MAX_MINUTES)} minutes between draws.`;
}

export function PaceField({
  value,
  onChange,
}: {
  readonly value: PaceChoice;
  readonly onChange: (next: PaceChoice) => void;
}): ReactElement {
  return (
    <fieldset>
      <legend>Pace</legend>
      <select
        className="sbr-select"
        data-testid="create-pace"
        aria-label="Pace"
        value={value.kind}
        onChange={(e) => {
          onChange(e.target.value === 'async' ? INITIAL_ASYNC : INITIAL_PACE);
        }}
      >
        <option value="realtime">Live</option>
        <option value="async">Asynchronous</option>
      </select>
      <small className="sbr-muted">
        {value.kind === 'async'
          ? 'Numbers come minutes or hours apart; players look in when they like.'
          : 'Everyone plays at the same time.'}
      </small>
    </fieldset>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourText = (h: number): string => `${String(h).padStart(2, '0')}:00`;

function HourSelect(props: {
  readonly value: number;
  readonly label: string;
  readonly testId: string;
  readonly onChange: (hour: number) => void;
}): ReactElement {
  return (
    <select
      className="sbr-select"
      style={{ width: 'auto' }}
      aria-label={props.label}
      data-testid={props.testId}
      value={props.value}
      onChange={(e) => {
        props.onChange(Number(e.target.value));
      }}
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {hourText(h)}
        </option>
      ))}
    </select>
  );
}

function QuietFields({
  quiet,
  onChange,
}: {
  readonly quiet: QuietChoice | null;
  readonly onChange: (next: QuietChoice | null) => void;
}): ReactElement {
  return (
    <>
      <label className="sbr-row">
        <input
          type="checkbox"
          data-testid="create-quiet"
          checked={quiet !== null}
          onChange={(e) => {
            onChange(e.target.checked ? RULESET_QUIET : null);
          }}
        />
        Quiet hours (no numbers at night)
      </label>
      {quiet === null ? null : (
        <div className="sbr-row">
          From
          <HourSelect
            value={quiet.startHour}
            label="Quiet hours from"
            testId="create-quiet-start"
            onChange={(startHour) => {
              onChange({ ...quiet, startHour });
            }}
          />
          to
          <HourSelect
            value={quiet.endHour}
            label="Quiet hours until"
            testId="create-quiet-end"
            onChange={(endHour) => {
              onChange({ ...quiet, endHour });
            }}
          />
        </div>
      )}
      <small className="sbr-muted" data-testid="create-time-zone">
        Times in {browserTimeZone()}.
      </small>
    </>
  );
}

// Draws of an asynchronous match: timed every N minutes or host draws, and the quiet hours.
export function AsyncFields({
  pace,
  draw,
  onPace,
  onDraw,
}: {
  readonly pace: Extract<PaceChoice, { kind: 'async' }>;
  readonly draw: DrawControl;
  readonly onPace: (next: PaceChoice) => void;
  readonly onDraw: (next: DrawControl) => void;
}): ReactElement {
  const minutes = pace.minutes ?? RULESET_MINUTES;
  return (
    <fieldset data-testid="create-async">
      <legend>Draws</legend>
      <select
        className="sbr-select"
        data-testid="create-async-draw-mode"
        aria-label="Draws"
        value={draw.mode}
        onChange={(e) => {
          onDraw({ ...draw, mode: e.target.value as DrawMode });
        }}
      >
        <option value="auto">Timed (every {String(minutes)} minutes)</option>
        <option value="host">Host presses Draw next</option>
      </select>
      <label className="sbr-row">
        Minutes between timed draws
        <input
          className="sbr-input"
          style={{ width: '6rem' }}
          type="number"
          min={1}
          max={MAX_MINUTES}
          placeholder={String(RULESET_MINUTES)}
          data-testid="create-async-minutes"
          value={pace.minutes ?? ''}
          onChange={(e) => {
            const next = Number(e.target.value);
            onPace({ ...pace, minutes: e.target.value === '' || next <= 0 ? null : next });
          }}
        />
      </label>
      <QuietFields
        quiet={pace.quiet}
        onChange={(quiet) => {
          onPace({ ...pace, quiet });
        }}
      />
      <small className="sbr-muted">Every drawn number is marked for every player.</small>
    </fieldset>
  );
}
