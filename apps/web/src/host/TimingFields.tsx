/**
 * @file   apps/web/src/host/TimingFields.tsx
 * @module web/host
 * @brief  The create form's timing rules: start rule, shortest draw interval (D12), round pause (D14).
 *
 * Responsibility: the start rule (I start it; at a set time at least a minute ahead, with
 *                 "Start automatically at the start time", default off, D16; when every
 *                 place is taken; 01 §7.6); the shortest timed-draw interval for the chosen game type and missed-
 *                 number rule (the shared rule from @sbr/contracts: 1 s longer than the
 *                 longest tap time) and the plain message when the seconds are below it;
 *                 the royale pause choice "Wait a few seconds" (N, at least 3) or "I start
 *                 each round myself". The server enforces both as well. Every option fits a
 *                 390 px phone.
 * Depends on:     react, @sbr/contracts
 * Used by:        ./CreateMatch
 * Spec:           docs/spec/01-game-design.md §5, §7.1 (D12, D14)
 */
import {
  classicRealtimeDefault,
  classicSeasonsRealtimeDefault,
  DEFAULT_ROUND_PAUSE_MS,
  MIN_ROUND_PAUSE_MS,
  royaleRealtimeDefault,
  shortestDrawIntervalMs,
} from '@sbr/contracts';
import type { ReactElement } from 'react';

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

// The request field (D14); the server keeps a wait at its minimum as well.
export function toRoundPause(p: RoundPauseChoice) {
  return p.kind === 'host'
    ? { kind: 'host' as const }
    : { kind: 'wait' as const, ms: Math.max(MIN_ROUND_PAUSE_MS, Math.round(p.sec * 1000)) };
}

export function RoundPauseField({
  value,
  onChange,
}: {
  readonly value: RoundPauseChoice;
  readonly onChange: (next: RoundPauseChoice) => void;
}): ReactElement {
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
            min={MIN_ROUND_PAUSE_MS / 1000}
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
  return Number.isFinite(at) && at >= now + 60_000
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
}: {
  readonly value: StartRuleChoice;
  readonly onChange: (next: StartRuleChoice) => void;
}): ReactElement {
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
        <option value="host">I start it from the console</option>
        <option value="at">At a set time</option>
        <option value="whenFull">When every place is taken</option>
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
      <small className="sbr-muted">Players see a 10-second countdown before the first round.</small>
    </fieldset>
  );
}
