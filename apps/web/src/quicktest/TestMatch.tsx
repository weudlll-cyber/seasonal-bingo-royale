/**
 * @file   apps/web/src/quicktest/TestMatch.tsx
 * @module web/quicktest
 * @brief  "Play a test match" on the test page: a real test match with bots, as players see it.
 *
 * Responsibility: for the dev host, the form (game type, start now or in N minutes, bots,
 *                 draws, "I play along", short royale rounds) and "Create test match" (./testMatchSetup:
 *                 the console in a new tab, this tab to the match's player route) with "What
 *                 happens next" under it; ./TestMatchReady's panel when this tab stays (tab
 *                 blocked, a step failed). Signed out or not the host: the dev "Sign in as host"
 *                 instead of the form. Maintenance on: the reason, and the button disabled (D22).
 * Depends on:     react, ./testMatchSetup, ./TestMatchReady, ../components/StartDrawField,
 *                 ../game/labels, ../host/createForm, ../host/host.css, ../shell/DevTools,
 *                 ../shell/session, ../shell/useMaintenance, ./quicktest.css
 * Used by:        ../App
 * Spec:           docs/spec/01-game-design.md §7.6 (D16, D22), §13; docs/spec/05-api-design.md §2.3
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import { StartDrawField } from '../components/StartDrawField.js';
import { GAME_TYPES, gameTypeName, problemText } from '../game/labels.js';
import { INITIAL, intervalMessage } from '../host/createForm.js';
import '../host/host.css';
import { useDevSignIn } from '../shell/DevTools.js';
import { useSession } from '../shell/session.js';
import { useMaintenanceState } from '../shell/useMaintenance.js';
import type { GameType } from '../types.js';
import {
  botLimits,
  DEFAULT_BOTS,
  INITIAL_TEST_MATCH,
  type TestMatchValues,
  useCreateTestMatch,
} from './testMatchSetup.js';
import { NextSteps, OpenedPanel, SetupError } from './TestMatchReady.js';
import './quicktest.css';

export function TestMatchSection(): ReactElement {
  const { can } = useSession();
  const [code, setCode] = useState<string | null>(null);
  const [values, setValues] = useState<TestMatchValues>(INITIAL_TEST_MATCH);
  // A failed step; kept here, so one after the match exists shows beside its code.
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="sbr-panel sbr-stack test-section" data-testid="test-match">
      <h2>Play a test match</h2>
      <p>
        A live match on this server with bots. This tab becomes your player screen, exactly as
        players see it; the host console opens in a new tab.
      </p>
      {!can('match.create') ? (
        <SignInFirst />
      ) : code === null ? (
        <TestMatchForm
          values={values}
          onValues={setValues}
          onOpened={setCode}
          error={error}
          onError={setError}
        />
      ) : (
        <OpenedPanel
          code={code}
          values={values}
          error={error}
          onNew={() => {
            setCode(null);
            setError(null);
          }}
        />
      )}
    </section>
  );
}

// Signed out, or signed in without match.create: the dev host is needed.
function SignInFirst(): ReactElement {
  const devSignIn = useDevSignIn();
  return (
    <div className="sbr-stack" data-testid="test-match-sign-in">
      <p>A test match is created by the dev host. Sign in as the host to set one up.</p>
      <button
        type="button"
        className="sbr-btn sbr-btn--primary"
        data-testid="test-match-sign-in-host"
        onClick={() => void devSignIn('host')}
      >
        Sign in as host
      </button>
    </div>
  );
}

interface FormProps {
  readonly values: TestMatchValues;
  readonly onValues: (next: TestMatchValues) => void;
  readonly onOpened: (code: string) => void;
  readonly error: string | null;
  readonly onError: (error: string | null) => void;
}

function TestMatchForm(props: FormProps): ReactElement {
  const { values, onValues, error } = props;
  const maintenance = useMaintenanceState();
  const { busy, create } = useCreateTestMatch(props);
  const set = <K extends keyof TestMatchValues>(key: K, value: TestMatchValues[K]): void => {
    onValues({ ...values, [key]: value });
  };
  // D12, as in the create form: seconds below the shortest interval are not sent.
  const tooShort = intervalMessage({ ...INITIAL, gameType: values.gameType, draw: values.draw });
  const held = maintenance?.on === true;
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (tooShort === null && !held) create();
  };
  return (
    <form className="create-form" onSubmit={submit} data-testid="test-match-form">
      <GameTypeField
        value={values.gameType}
        onChange={(g) => {
          // The bots follow the game type's default until the owner changes them.
          onValues({ ...values, gameType: g, bots: DEFAULT_BOTS[g] });
        }}
      />
      <StartField values={values} onValues={onValues} />
      <BotsField values={values} onValues={onValues} />
      <StartDrawField
        value={values.draw}
        onChange={(d) => {
          set('draw', d);
        }}
      />
      {tooShort !== null ? <p className="lobby-error">{tooShort}</p> : null}
      <OptionsFields values={values} onValues={onValues} />
      {held ? (
        <p className="lobby-error" role="status" data-testid="test-match-maintenance">
          {problemText('MAINTENANCE', maintenance.reason)}
        </p>
      ) : null}
      <SetupError error={error} />
      <button
        type="submit"
        className="sbr-btn sbr-btn--primary sbr-btn--big"
        data-testid="test-match-create"
        disabled={busy || held || tooShort !== null}
      >
        {busy ? 'Creating…' : 'Create test match'}
      </button>
      <NextSteps values={values} code={null} />
    </form>
  );
}

function GameTypeField({
  value,
  onChange,
}: {
  readonly value: GameType;
  readonly onChange: (next: GameType) => void;
}): ReactElement {
  return (
    <label className="sbr-field">
      <span>Game type</span>
      <select
        className="sbr-select"
        data-testid="test-match-game-type"
        value={value}
        onChange={(e) => {
          onChange(e.target.value as GameType);
        }}
      >
        {GAME_TYPES.map((g) => (
          <option key={g} value={g}>
            {gameTypeName(g)}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ValuesProps {
  readonly values: TestMatchValues;
  readonly onValues: (next: TestMatchValues) => void;
}

// "Now" (the host's Start, 10-second countdown) or a set time with the automatic start.
function StartField({ values, onValues }: ValuesProps): ReactElement {
  const start = values.start;
  const choice = start.kind === 'now' ? 'now' : start.minutes === 1 ? 'in1' : 'inN';
  return (
    <fieldset>
      <legend>Start</legend>
      <select
        className="sbr-select"
        aria-label="Start"
        data-testid="test-match-start"
        value={choice}
        onChange={(e) => {
          const next = e.target.value;
          onValues({
            ...values,
            start:
              next === 'now' ? { kind: 'now' } : { kind: 'in', minutes: next === 'in1' ? 1 : 5 },
          });
        }}
      >
        <option value="now">Now (10-second countdown)</option>
        <option value="in1">In 1 minute</option>
        <option value="inN">In N minutes</option>
      </select>
      {choice === 'inN' && start.kind === 'in' ? (
        <label className="sbr-row">
          Minutes
          <input
            className="sbr-input test-number"
            type="number"
            min={2}
            max={60}
            value={start.minutes}
            data-testid="test-match-minutes"
            onChange={(e) => {
              onValues({ ...values, start: { kind: 'in', minutes: Number(e.target.value) } });
            }}
          />
        </label>
      ) : null}
    </fieldset>
  );
}

function BotsField({ values, onValues }: ValuesProps): ReactElement {
  const { min, max } = botLimits(values.playAlong);
  return (
    <label className="sbr-field">
      <span>
        Bots ({String(min)}–{String(max)}; they mark automatically)
      </span>
      <input
        className="sbr-input test-number"
        type="number"
        min={min}
        max={max}
        value={values.bots}
        data-testid="test-match-bots"
        onChange={(e) => {
          onValues({ ...values, bots: Number(e.target.value) });
        }}
      />
    </label>
  );
}

function OptionsFields({ values, onValues }: ValuesProps): ReactElement {
  return (
    <>
      <label className="sbr-row">
        <input
          type="checkbox"
          data-testid="test-match-play-along"
          checked={values.playAlong}
          onChange={(e) => {
            onValues({ ...values, playAlong: e.target.checked });
          }}
        />
        I play along (you join as a player with your own card)
      </label>
      {values.gameType === 'royale' ? (
        <label className="sbr-row">
          <input
            type="checkbox"
            data-testid="test-match-fast"
            checked={values.fast}
            onChange={(e) => {
              onValues({ ...values, fast: e.target.checked });
            }}
          />
          Short royale rounds (fast test rules)
        </label>
      ) : null}
    </>
  );
}
