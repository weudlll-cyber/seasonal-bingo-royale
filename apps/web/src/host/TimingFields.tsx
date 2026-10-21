/**
 * @file   apps/web/src/host/TimingFields.tsx
 * @module web/host
 * @brief  The create form's timing rules: shortest draw interval (D12), pause between rounds (D14).
 *
 * Responsibility: the shortest timed-draw interval for the chosen game type and missed-
 *                 number rule (the shared rule from @sbr/contracts: 1 s longer than the
 *                 longest tap time) and the plain message when the seconds are below it;
 *                 the royale pause choice "wait N seconds" (at least 3) or "host starts the
 *                 next round". The server enforces both as well.
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
        <option value="wait">Wait a few seconds, then start the next round</option>
        <option value="host">I start the next round myself</option>
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
