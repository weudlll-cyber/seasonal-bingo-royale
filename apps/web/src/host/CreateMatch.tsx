/**
 * @file   apps/web/src/host/CreateMatch.tsx
 * @module web/host
 * @brief  The host creates a match from a published default ruleset (11 §3.2, draft depth).
 *
 * Responsibility: above the form, the host's open and running matches (./YourMatches); then
 *                 title, game type, prizes for classic types (five defaults ticked), the royale's
 *                 pace (live, or asynchronous with minutes and quiet hours, ./AsyncFields), draws
 *                 (timed every N seconds, or host draws) and missed numbers as in the Quick Test,
 *                 the leaderboard switch (on for royale, off for classic), max players, the
 *                 royale round pause (D14) and the start rule (01 §7.6). Intervals out of range
 *                 (D12; async minutes) show a plain message and block sending. POST /matches,
 *                 then the console.
 * Depends on:     react, ../components/StartDrawField, ../components/StartMarkingField,
 *                 ../shell/http, ../shell/router, @sbr/contracts (prize list), ../game/labels,
 *                 ./createForm (values, defaults, interval checks, request body), ./TimingFields,
 *                 ./AsyncFields, ../game/game.css, ./host.css, ./YourMatches, ../types
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/11-admin-panel.md §3.2; docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §3a, §5, §6, §11
 */
import { BUILTIN_PRIZE_KEYS } from '@sbr/contracts';
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import { StartDrawField } from '../components/StartDrawField.js';
import { MissedField } from '../components/StartMarkingField.js';
import { gameTypeName, prizeName, problemText } from '../game/labels.js';
import '../game/game.css';
import './host.css';
import { api, ApiError } from '../shell/http.js';
import { navigate } from '../shell/router.js';
import { AsyncFields, PaceField } from './AsyncFields.js';
import { createBody, INITIAL, intervalMessage, paceOf, type FormValues } from './createForm.js';
import { RoundPauseField, StartRuleField, startTimeProblem } from './TimingFields.js';
import { YourMatches } from './YourMatches.js';
import type { GameType } from '../types.js';

const GAME_TYPES: readonly GameType[] = ['royale', 'classicSeasons', 'classic'];

export function CreateMatch(): ReactElement {
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]): void => {
    setValues((v) => ({ ...v, [key]: value }));
  };
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    // D12 and the start time: the message under the field says why nothing is sent.
    if (intervalMessage(values) !== null) return;
    const startProblem = startTimeProblem(values.start, Date.now());
    setError(startProblem);
    if (startProblem !== null) return;
    api<{ code: string }>('/matches', { method: 'POST', body: createBody(values) })
      .then((r) => {
        navigate({ name: 'host', code: r.code });
      })
      .catch((e: unknown) => {
        setError(
          e instanceof ApiError
            ? `Could not create the match: ${problemText(e.code)}`
            : 'Could not create the match.',
        );
      });
  };
  return (
    <div className="create-page">
      <YourMatches />
      <form className="create-form" onSubmit={submit} data-testid="create-match">
        <h1>Host a match</h1>
        <BasicsFields values={values} set={set} />
        {values.gameType === 'royale' ? null : (
          <PrizeField
            prizes={values.prizes}
            onChange={(p) => {
              set('prizes', p);
            }}
          />
        )}
        <RulesFields values={values} set={set} />
        <StartRuleField
          value={values.start}
          onChange={(s) => {
            set('start', s);
          }}
        />
        {error !== null ? <p className="lobby-error">{error}</p> : null}
        <button
          type="submit"
          className="sbr-btn sbr-btn--primary sbr-btn--big"
          data-testid="create-submit"
        >
          Create match
        </button>
      </form>
    </div>
  );
}

interface FieldsProps {
  readonly values: FormValues;
  readonly set: <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;
}

function BasicsFields({ values, set }: FieldsProps): ReactElement {
  return (
    <>
      <label className="sbr-field">
        <span>Title</span>
        <input
          className="sbr-input"
          data-testid="create-title"
          value={values.title}
          maxLength={60}
          onChange={(e) => {
            set('title', e.target.value);
          }}
        />
      </label>
      <label className="sbr-field">
        <span>Game type</span>
        <select
          className="sbr-select"
          data-testid="create-game-type"
          value={values.gameType}
          onChange={(e) => {
            set('gameType', e.target.value as GameType);
          }}
        >
          {GAME_TYPES.map((g) => (
            <option key={g} value={g}>
              {gameTypeName(g)}
            </option>
          ))}
        </select>
      </label>
      <label className="sbr-field">
        <span>Max players (2–200)</span>
        <input
          className="sbr-input"
          type="number"
          min={2}
          max={200}
          data-testid="create-max"
          value={values.maxPlayers}
          onChange={(e) => {
            set('maxPlayers', Number(e.target.value));
          }}
        />
      </label>
    </>
  );
}

function PrizeField({
  prizes,
  onChange,
}: {
  readonly prizes: ReadonlySet<string>;
  readonly onChange: (next: ReadonlySet<string>) => void;
}): ReactElement {
  const toggle = (key: string): void => {
    const next = new Set(prizes);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };
  return (
    <fieldset data-testid="create-prizes">
      <legend>Prizes</legend>
      <div className="prize-grid">
        {BUILTIN_PRIZE_KEYS.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              data-testid={`prize-${key}`}
              checked={prizes.has(key)}
              onChange={() => {
                toggle(key);
              }}
            />{' '}
            {prizeName(key)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Live draws (seconds, D12 message) and missed numbers; or the asynchronous draws (minutes,
// quiet hours; everyone marked automatically, 01 §6).
function DrawFields({ values, set }: FieldsProps): ReactElement {
  const pace = paceOf(values);
  const problem = intervalMessage(values);
  return (
    <>
      {values.gameType === 'royale' ? (
        <PaceField
          value={values.pace}
          onChange={(p) => {
            set('pace', p);
          }}
        />
      ) : null}
      {pace.kind === 'async' ? (
        <AsyncFields
          pace={pace}
          draw={values.draw}
          onPace={(p) => {
            set('pace', p);
          }}
          onDraw={(d) => {
            set('draw', d);
          }}
        />
      ) : (
        <StartDrawField
          value={values.draw}
          onChange={(d) => {
            set('draw', d);
          }}
        />
      )}
      {problem !== null ? (
        <p className="lobby-error" role="alert" data-testid="create-interval-problem">
          {problem}
        </p>
      ) : null}
      {pace.kind === 'async' ? null : (
        <fieldset>
          <legend>Missed numbers</legend>
          <MissedField
            value={values.missed}
            onChange={(m) => {
              set('missed', m);
            }}
          />
        </fieldset>
      )}
    </>
  );
}

// Draws, the royale pause (D14), the leaderboard.
function RulesFields({ values, set }: FieldsProps): ReactElement {
  return (
    <>
      <DrawFields values={values} set={set} />
      {values.gameType === 'royale' ? (
        <RoundPauseField
          value={values.pause}
          onChange={(p) => {
            set('pause', p);
          }}
        />
      ) : null}
      <label className="sbr-row">
        <input
          type="checkbox"
          data-testid="create-leaderboard"
          checked={values.leaderboard ?? values.gameType === 'royale'}
          onChange={(e) => {
            set('leaderboard', e.target.checked);
          }}
        />
        Counts for the leaderboard
      </label>
      {import.meta.env.DEV ? (
        <label className="sbr-row">
          <input
            type="checkbox"
            data-testid="create-fast"
            checked={values.fast === true}
            onChange={(e) => {
              set('fast', e.target.checked);
            }}
          />
          Fast test rules (development only: short royale rounds)
        </label>
      ) : null}
    </>
  );
}
