/**
 * @file   apps/web/src/host/ThisMatchFields.tsx
 * @module web/host
 * @brief  Step 3 of "Start a match": only what changes from match to match, inside the preset.
 *
 * Responsibility: title (the server's length limit), start (only the starts the preset allows),
 *                 players ("up to N", a slider inside the preset's range), speed in words
 *                 (relaxed, normal, quick, with the interval it means), the website switch in
 *                 website mode (D50), and "More choices", closed: between rounds (royale),
 *                 missed numbers (live matches), counts for the league, and in development the
 *                 fast test rules (admin-area §3, §8 (g), (h), (o)).
 * Depends on:     react, @sbr/contracts (SPEEDS), ../components/StartMarkingField,
 *                 ../shell/session, ./startForm, ./TimingFields
 * Used by:        ./StartMatch
 * Spec:           docs/concepts/admin-area.md §3, §8 (g), (h), (o), §9 piece 4
 */
import { SPEEDS, type Speed } from '@sbr/contracts';
import type { ReactElement } from 'react';

import { MissedField } from '../components/StartMarkingField.js';
import { useLimits, useSession } from '../shell/session.js';
import { speedText, type StartPreset, type StartValues } from './startForm.js';
import { RoundPauseField, StartRuleField } from './TimingFields.js';

export interface ChoiceProps {
  readonly preset: StartPreset;
  readonly values: StartValues;
  readonly set: <K extends keyof StartValues>(key: K, value: StartValues[K]) => void;
}

const SPEED_NAMES: Readonly<Record<Speed, string>> = {
  relaxed: 'Relaxed',
  normal: 'Normal',
  quick: 'Quick',
};

export function ThisMatchFields({ preset, values, set }: ChoiceProps): ReactElement {
  const limits = useLimits();
  const website = useSession().session?.authMode === 'website';
  return (
    <section className="start-step" aria-labelledby="start-step-3">
      <h2 id="start-step-3">
        <span className="start-step-num">3</span>This match
      </h2>
      <label className="sk-field">
        <span>Title</span>
        <input
          className="sk-input"
          value={values.title}
          maxLength={limits?.titleMaxLength}
          required
          data-testid="start-title"
          onChange={(e) => {
            set('title', e.target.value);
          }}
        />
      </label>
      <StartRuleField
        value={values.start}
        allowed={preset.starts}
        onChange={(s) => {
          set('start', s);
        }}
      />
      <PlayersField preset={preset} values={values} set={set} />
      <SpeedField preset={preset} values={values} set={set} />
      {website ? (
        <label className="sbr-row start-check">
          <input
            type="checkbox"
            data-testid="create-website"
            checked={values.website}
            onChange={(e) => {
              set('website', e.target.checked);
            }}
          />
          Show on the Seasonal Entertainment website
        </label>
      ) : null}
      <MoreChoices preset={preset} values={values} set={set} />
    </section>
  );
}

// "Players: up to N", a slider inside the preset's range.
function PlayersField({ preset, values, set }: ChoiceProps): ReactElement {
  return (
    <label className="sk-field">
      <span>Players: up to {values.players}</span>
      <input
        type="range"
        className="start-range"
        min={preset.players.min}
        max={preset.players.max}
        value={values.players}
        data-testid="start-players"
        onChange={(e) => {
          set('players', Number(e.target.value));
        }}
      />
      <small className="sbr-muted">
        This preset allows {preset.players.min} to {preset.players.max}.
      </small>
    </label>
  );
}

// Relaxed, normal, quick: three buttons, the chosen one pressed, and what it means.
function SpeedField({ preset, values, set }: ChoiceProps): ReactElement {
  return (
    <div className="sk-field">
      <span id="start-speed">Speed</span>
      <div className="start-segmented" role="group" aria-labelledby="start-speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={values.speed === s ? 'sk-btn sk-btn--primary' : 'sk-btn'}
            aria-pressed={values.speed === s}
            data-testid={`start-speed-${s}`}
            onClick={() => {
              set('speed', s);
            }}
          >
            {SPEED_NAMES[s]}
          </button>
        ))}
      </div>
      <small className="sbr-muted">{speedText(preset, values.speed)}.</small>
    </div>
  );
}

// Closed by default: between rounds, missed numbers, the league, development's fast rules.
function MoreChoices({ preset, values, set }: ChoiceProps): ReactElement {
  const live = preset.mode === 'realtime';
  return (
    <details className="start-more">
      <summary data-testid="start-more">More choices</summary>
      {preset.gameType === 'royale' ? (
        <RoundPauseField
          value={values.pause}
          onChange={(p) => {
            set('pause', p);
          }}
        />
      ) : null}
      {live ? (
        <fieldset>
          <legend>Missed numbers</legend>
          <MissedField
            value={values.missed}
            onChange={(m) => {
              set('missed', m);
            }}
          />
        </fieldset>
      ) : null}
      <label className="sbr-row start-check">
        <input
          type="checkbox"
          data-testid="create-leaderboard"
          checked={values.leaderboard ?? preset.countsForLeaderboard}
          onChange={(e) => {
            set('leaderboard', e.target.checked);
          }}
        />
        Counts for the league
      </label>
      {import.meta.env.DEV && live && preset.gameType === 'royale' ? (
        <label className="sbr-row start-check">
          <input
            type="checkbox"
            data-testid="create-fast"
            checked={values.fast}
            onChange={(e) => {
              set('fast', e.target.checked);
            }}
          />
          Fast test rules (development only: short royale rounds, not the preset)
        </label>
      ) : null}
    </details>
  );
}
