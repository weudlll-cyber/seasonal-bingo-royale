/**
 * @file   apps/web/src/host/TimingFields.tsx
 * @module web/host
 * @brief  Timing choices of a new match: start rule, shortest draw interval (D12), round pause (D14).
 *
 * Responsibility: the start rule, only the starts the preset allows (now: I start it; at a set time at least a minute ahead, with
 *                 "Start automatically at the start time", default off, D16; when every
 *                 place is taken; 01 §7.6); the shortest timed-draw interval for the chosen game type and missed-
 *                 number rule (the shared rule from @sbr/contracts: 1 s longer than the
 *                 longest tap time) and the plain message when the seconds are below it;
 *                 the royale pause choice "Wait a few seconds" (N, within the server's range:
 *                 3 to 120 s today) or "I start each round myself"; the start countdown named
 *                 as the server sends it. Ranges and the countdown come from the session's
 *                 limits (admin-area §8 (m)). The server enforces both as well. Every option
 *                 fits a 390 px phone.
 * Depends on:     react, @sbr/contracts, ../game/labels, ../shell/session, ../types
 * Used by:        ./ThisMatchFields, ./StartMatch, ./startForm, ./HostDrawControls, ./HostLobby,
 *                 ./createForm
 * Spec:           docs/spec/01-game-design.md §5, §7.1 (D12, D14)
 */
import {
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  DEFAULT_ROUND_PAUSE_MS,
  MIN_START_AHEAD_MS,
  royaleRealtimeDefault,
  shortestDrawIntervalMs,
} from '@sbr/contracts';
import type { ReactElement } from 'react';

import { countdownName } from '../game/labels.js';
import { useLimits } from '../shell/session.js';
import type { GameType, MissedNumbers } from '../types.js';

const RULESETS = {
  royale: royaleRealtimeDefault,
  classicSeasons: classicSeasonsRealtimeDefault,
  classic: classicRealtimeDefault,
} as const;

// Seconds as the forms show them: "6" or "6.5".
const secondsText = (ms: number): string => String(Math.round(ms / 100) / 10);

// The shortest timed-draw interval of a match with these choices (D12), in ms.
export function shortestInterval(gameType: GameType, missed: MissedNumbers): number {
  const windowMs = RULESETS[gameType].marking.speedWindowMs;
  const delay = missed.kind === 'autoMarkAfter' ? Math.max(windowMs, missed.delayMs) : null;
  return shortestDrawIntervalMs(windowMs, delay);
}

// The match's seconds between draws when the host left the field empty (ruleset value).
export function rulesetIntervalMs(gameType: GameType): number {
  return RULESETS[gameType].draws.intervalMsRealtime;
}

// The plain message for seconds below the shortest interval (D12), or null when fine.
export function intervalProblem(chosenMs: number, shortestMs: number): string | null {
  if (chosenMs >= shortestMs) return null;
  return `Draws need at least ${secondsText(shortestMs)} seconds between them: 1 second more than the longest tap time.`;
}

export type RoundPauseChoice =
  { readonly kind: 'wait'; readonly sec: number } | { readonly kind: 'host' };

export const INITIAL_PAUSE: RoundPauseChoice = { kind: 'wait', sec: DEFAULT_ROUND_PAUSE_MS / 1000 };

// The request field (D14): the field keeps the server's range, and the server keeps a wait
// at its minimum as well.
export function toRoundPause(p: RoundPauseChoice) {
  return p.kind === 'host'
    ? { kind: 'host' as const }
    : { kind: 'wait' as const, ms: Math.round(p.sec * 1000) };
}

export function RoundPauseField({
  value,
  onChange,
}: {
  readonly value: RoundPauseChoice;
  readonly onChange: (next: RoundPauseChoice) => void;
}): ReactElement | null {
  // The server's range (admin-area §8 (m)): the browser refuses a value outside it before
  // the form is sent.
  const range = useLimits()?.roundPauseMs;
  if (range === undefined) return null;
  return (
    <fieldset>
      <legend>Between rounds</legend>
      <select
        className="sbr-select"
        data-testid="create-round-pause"
        aria-label="Between rounds"
        value={value.kind}
        onChange={(e) => {
          onChange(e.target.value === 'host' ? { kind: 'host' } : INITIAL_PAUSE);
        }}
      >
        <option value="wait">Wait a few seconds</option>
        <option value="host">I start each round myself</option>
      </select>
      {value.kind === 'wait' ? (
        <label className="sbr-row">
          Seconds to wait
          <input
            className="sbr-input"
            style={{ width: '6rem' }}
            type="number"
            min={range.min / 1000}
            max={range.max / 1000}
            step={1}
            value={value.sec}
            data-testid="create-round-pause-sec"
            onChange={(e) => {
              onChange({ kind: 'wait', sec: Number(e.target.value) });
            }}
          />
        </label>
      ) : null}
    </fieldset>
  );
}

// How the match starts (01 §7.6, D16); `local` is the date and time field's value, `auto`
// the automatic start at that time.
export type StartRuleChoice =
  | { readonly kind: 'host' }
  | { readonly kind: 'at'; readonly local: string; readonly auto: boolean }
  | { readonly kind: 'whenFull' };

// The request field; null for a set time that is missing or not at least a minute ahead.
export function toStartRule(c: StartRuleChoice, now: number) {
  if (c.kind !== 'at') return { kind: c.kind };
  const at = new Date(c.local).getTime();
  return Number.isFinite(at) && at >= now + MIN_START_AHEAD_MS
    ? { kind: 'at' as const, at, auto: c.auto }
    : null;
}

// "Start automatically at the start time" (D16): in the create form and in the console.
export function AutoStartBox({
  checked,
  onChange,
  testId,
  disabled = false,
}: {
  readonly checked: boolean;
  readonly onChange: (auto: boolean) => void;
  readonly testId: string;
  readonly disabled?: boolean;
}): ReactElement {
  return (
    <label className="sbr-row">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      Start automatically at the start time
    </label>
  );
}

// The plain message for a set time that cannot be used, or null.
export function startTimeProblem(c: StartRuleChoice, now: number): string | null {
  return toStartRule(c, now) === null ? 'Pick a start time at least a minute from now.' : null;
}

export function StartRuleField({
  value,
  onChange,
  allowed,
}: {
  readonly value: StartRuleChoice;
  readonly onChange: (next: StartRuleChoice) => void;
  // The starts the preset allows the Organizer (admin-area §3).
  readonly allowed: { readonly now: boolean; readonly at: boolean; readonly whenFull: boolean };
}): ReactElement {
  const limits = useLimits();
  return (
    <fieldset>
      <legend>Start</legend>
      <select
        className="sbr-select"
        data-testid="create-start-rule"
        aria-label="Start"
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as StartRuleChoice['kind'];
          onChange(kind === 'at' ? { kind, local: '', auto: false } : { kind });
        }}
      >
        {allowed.now ? <option value="host">Now: I start it from the console</option> : null}
        {allowed.at ? <option value="at">At a set time</option> : null}
        {allowed.whenFull ? <option value="whenFull">When every place is taken</option> : null}
      </select>
      {value.kind === 'at' ? (
        <label className="sbr-row">
          Start time
          <input
            className="sbr-input"
            style={{ width: 'auto' }}
            type="datetime-local"
            value={value.local}
            data-testid="create-start-at"
            onChange={(e) => {
              onChange({ ...value, local: e.target.value });
            }}
          />
        </label>
      ) : null}
      {value.kind === 'at' ? (
        <AutoStartBox
          testId="create-start-auto"
          checked={value.auto}
          onChange={(auto) => {
            onChange({ ...value, auto });
          }}
        />
      ) : null}
      {limits === null ? null : (
        <small className="sbr-muted">
          Players see a {countdownName(limits.startCountdownMs)} before the first round.
        </small>
      )}
    </fieldset>
  );
}
