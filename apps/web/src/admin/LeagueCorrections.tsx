/**
 * @file   apps/web/src/admin/LeagueCorrections.tsx
 * @module web/admin
 * @brief  Corrections of a player's league points: the form, and the latest corrections.
 *
 * Responsibility: a player's display name, the points to add or take away (never 0) and a
 *                 reason the player reads on their profile; "Add the correction" posts it
 *                 (POST /admin/league/corrections) and the page reloads. The latest
 *                 corrections below, newest first: when, who, +/− points, the reason. A wrong
 *                 correction is undone by one the other way (the server never changes one).
 * Depends on:     react, ../game/labels, ../shell/http, ./changeText (when)
 * Used by:        ./AdminLeague
 * Spec:           docs/concepts/admin-area.md §4 (League), §9 piece 5
 */
import { useState, type ReactElement } from 'react';

import { pointsDelta, problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { when } from './changeText.js';

export interface CorrectionView {
  readonly id: number;
  readonly player: string | null;
  readonly delta: number;
  readonly reason: string;
  readonly at: number;
}

export function LeagueCorrections(props: {
  readonly corrections: readonly CorrectionView[];
  readonly onAdded: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim() !== '' && Number(delta) !== 0 && reason.trim().length >= 3;
  const add = (): void => {
    setError(null);
    api('/admin/league/corrections', {
      method: 'POST',
      body: { displayName: name.trim(), delta: Number(delta), reason },
    })
      .then(props.onAdded)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? problemText(e.code) : problemText(''));
      });
  };
  return (
    <section className="sk-panel sbr-stack" aria-labelledby="league-corrections-title">
      <h2 id="league-corrections-title">Corrections</h2>
      <p className="sbr-muted">
        Adds or takes away league points this season and on the all-time board. The player sees the
        reason on their profile. Undo a correction with one the other way.
      </p>
      <Line label="Player" value={name} onChange={setName} testId="correction-player" />
      <Line
        label="Points (+ or −)"
        value={delta}
        onChange={setDelta}
        testId="correction-delta"
        number
      />
      <Line
        label="Reason the player sees"
        value={reason}
        onChange={setReason}
        testId="correction-reason"
      />
      {error === null ? null : <p className="lobby-error">{error}</p>}
      <button
        type="button"
        className="sk-btn"
        disabled={!ready}
        data-testid="correction-add"
        onClick={add}
      >
        Add the correction
      </button>
      <CorrectionList corrections={props.corrections} />
    </section>
  );
}

// The latest corrections, newest first: when, who, the points and the reason.
function CorrectionList(props: { readonly corrections: readonly CorrectionView[] }): ReactElement {
  return (
    <ol className="admin-history">
      {props.corrections.map((c) => (
        <li key={c.id} className="admin-match sbr-stack" data-testid={`correction-${String(c.id)}`}>
          <p className="sbr-muted admin-match-facts">
            {when(c.at)} · {c.player ?? 'a removed account'}
          </p>
          <p>
            <strong>{pointsDelta(c.delta)}</strong> — {c.reason}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Line(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly testId: string;
  readonly number?: boolean;
}): ReactElement {
  return (
    <label className="sk-field">
      <span>{props.label}</span>
      <input
        className="sk-input"
        type={props.number === true ? 'number' : 'text'}
        step={1}
        value={props.value}
        data-testid={props.testId}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
      />
    </label>
  );
}
