/**
 * @file   apps/web/src/admin/AdminSwitches.tsx
 * @module web/admin
 * @brief  The Overview's switches: guests and e-mail confirmation, saved as a new version.
 *
 * Responsibility: the two switches as the server sends them, each with what changing it does
 *                 (admin-area §4); a comment for the History and Save, which posts both
 *                 switches (POST /admin/switches) and shows what the server stored. A change
 *                 applies at once; the History lists it with "Undo this change".
 * Depends on:     react, ../game/labels, ../shell/http, ./changeText
 * Used by:        ./AdminOverview
 * Spec:           docs/concepts/admin-area.md §4 (Overview), §8 (p), §9 piece 2
 */
import { useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { SWITCH_NAMES } from './changeText.js';

export interface Switches {
  readonly guests: boolean;
  readonly emailVerification: boolean;
}

// What changing each switch does, under its name.
const WHAT_IT_DOES: Readonly<Record<keyof Switches, string>> = {
  guests: 'People without an account can watch matches. Off: only signed-in players can.',
  emailVerification:
    'Players must confirm their e-mail address before they can sign in and earn league points. Turning it on locks out players who never confirmed.',
};

export function AdminSwitches({ value }: { readonly value: Switches }): ReactElement {
  const [saved, setSaved] = useState(value);
  const [draft, setDraft] = useState(value);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const save = (): void => {
    setMessage(null);
    api<{ switches: Switches }>('/admin/switches', {
      method: 'POST',
      body: { ...draft, comment },
    })
      .then((r) => {
        setSaved(r.switches);
        setDraft(r.switches);
        setComment('');
        setMessage('Saved. It applies at once.');
      })
      .catch((e: unknown) => {
        setMessage(e instanceof ApiError ? problemText(e.code) : problemText(''));
      });
  };
  const changed =
    draft.guests !== saved.guests || draft.emailVerification !== saved.emailVerification;
  return (
    <section className="sk-panel sbr-stack" aria-labelledby="admin-switches-title">
      <h2 id="admin-switches-title">Switches</h2>
      {(['guests', 'emailVerification'] as const).map((key) => (
        <SwitchRow
          key={key}
          name={key}
          checked={draft[key]}
          onChange={(on) => {
            setDraft({ ...draft, [key]: on });
          }}
        />
      ))}
      <label className="sk-field">
        <span>Comment for the History (optional)</span>
        <input
          className="sk-input"
          value={comment}
          data-testid="admin-switches-comment"
          onChange={(e) => {
            setComment(e.target.value);
          }}
        />
      </label>
      {message === null ? null : <p role="status">{message}</p>}
      <button
        type="button"
        className="sk-btn sk-btn--primary"
        disabled={!changed}
        data-testid="admin-switches-save"
        onClick={save}
      >
        Save the switches
      </button>
    </section>
  );
}

// One switch: its box, its name and what changing it does.
function SwitchRow(props: {
  readonly name: keyof Switches;
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
}): ReactElement {
  return (
    <label className="admin-switch">
      <input
        type="checkbox"
        checked={props.checked}
        data-testid={`admin-switch-${props.name}`}
        onChange={(e) => {
          props.onChange(e.target.checked);
        }}
      />
      <span>
        <strong>{SWITCH_NAMES[props.name]}</strong>
        <span className="sbr-muted admin-switch-what">{WHAT_IT_DOES[props.name]}</span>
      </span>
    </label>
  );
}
