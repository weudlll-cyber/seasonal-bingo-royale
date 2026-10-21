/**
 * @file   apps/web/src/host/CreateMatch.tsx
 * @module web/host
 * @brief  The host creates a match from a published default ruleset (11 §3.2, draft depth).
 *
 * Responsibility: title, game type, prizes for the classic types (the five defaults
 *                 ticked), draws (timed every N seconds, or host presses Draw next — the
 *                 Quick Test's field), missed numbers (marked after N seconds, or left open —
 *                 the Quick Test's field), the leaderboard switch (on for royale, off for the
 *                 classic types by default), max players, and the start rule (the host
 *                 starts, with a 10-second countdown). POST /matches, then the host console.
 * Depends on:     react, ../components/StartDrawField, ../components/StartMarkingField,
 *                 ../shell/http, ../shell/router, ../prizes, ../game/labels
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/11-admin-panel.md §3.2; docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §3a, §5, §6
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import { StartDrawField } from '../components/StartDrawField.js';
import {
  INITIAL_MARKING,
  MissedField,
  toMissedNumbers,
  type MarkingChoice,
} from '../components/StartMarkingField.js';
import { INITIAL_CONTROL, type DrawControl } from '../drawControl.js';
import { gameTypeName } from '../game/labels.js';
import '../game/game.css';
import { DEFAULT_PRIZES, PRIZE_CATALOGUE } from '../prizes.js';
import { api, ApiError } from '../shell/http.js';
import { navigate } from '../shell/router.js';
import type { GameType } from '../types.js';

const GAME_TYPES: readonly GameType[] = ['royale', 'classicSeasons', 'classic'];

interface FormValues {
  readonly title: string;
  readonly gameType: GameType;
  readonly prizes: ReadonlySet<string>;
  readonly draw: DrawControl;
  readonly missed: MarkingChoice;
  // null until the host touches it: then the game type's default applies.
  readonly leaderboard: boolean | null;
  readonly maxPlayers: number;
}

const INITIAL: FormValues = {
  title: 'Bingo night',
  gameType: 'royale',
  prizes: new Set(DEFAULT_PRIZES),
  draw: INITIAL_CONTROL,
  missed: INITIAL_MARKING,
  leaderboard: null,
  maxPlayers: 20,
};

// The POST /matches body (05 §2.3); the server clamps seconds and delays into range.
export function createBody(v: FormValues) {
  return {
    title: v.title,
    gameType: v.gameType,
    ...(v.gameType === 'royale' ? {} : { prizes: PRIZE_CATALOGUE.filter((p) => v.prizes.has(p)) }),
    drawMode: v.draw.mode,
    ...(v.draw.intervalSec === null
      ? {}
      : { drawIntervalMs: Math.round(v.draw.intervalSec * 1000) }),
    missedNumbers: toMissedNumbers(v.missed),
    countsForLeaderboard: v.leaderboard ?? v.gameType === 'royale',
    maxPlayers: Math.min(200, Math.max(2, v.maxPlayers)),
  };
}

export function CreateMatch(): ReactElement {
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]): void => {
    setValues((v) => ({ ...v, [key]: value }));
  };
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    api<{ code: string }>('/matches', { method: 'POST', body: createBody(values) })
      .then((r) => {
        navigate({ name: 'host', code: r.code });
      })
      .catch((e: unknown) => {
        setError(
          e instanceof ApiError
            ? `Could not create the match (${e.code}).`
            : 'Could not create the match.',
        );
      });
  };
  return (
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
      <p className="sbr-muted">
        Start: you start the match from the console; players see a 10-second countdown.
      </p>
      {error !== null ? <p className="lobby-error">{error}</p> : null}
      <button
        type="submit"
        className="sbr-btn sbr-btn--primary sbr-btn--big"
        data-testid="create-submit"
      >
        Create match
      </button>
    </form>
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
        {PRIZE_CATALOGUE.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              data-testid={`prize-${key}`}
              checked={prizes.has(key)}
              onChange={() => {
                toggle(key);
              }}
            />{' '}
            {key}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Draws, missed numbers and the leaderboard switch.
function RulesFields({ values, set }: FieldsProps): ReactElement {
  return (
    <>
      <StartDrawField
        value={values.draw}
        onChange={(d) => {
          set('draw', d);
        }}
      />
      <fieldset>
        <legend>Missed numbers</legend>
        <MissedField
          value={values.missed}
          onChange={(m) => {
            set('missed', m);
          }}
        />
      </fieldset>
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
    </>
  );
}
