/**
 * @file   apps/web/src/admin/AdminLeague.tsx
 * @module web/admin
 * @brief  The admin area's League: the league values, and corrections of a player's points.
 *
 * Responsibility: what GET /admin/league answers: the league values as generated fields
 *                 (./ValueField: name, what it does, unit, built-in value, technical limit), a
 *                 comment and Save, which sends only the changed values (POST /admin/league)
 *                 and applies to matches whose points are awarded afterwards; below, the
 *                 corrections (./LeagueCorrections). The server checks every value and
 *                 permission; the page shows what it answered or why it refused.
 * Depends on:     react, ../game/labels, ../shell/http, ./AdminNav, ./LeagueCorrections,
 *                 ./PresetEditor (Draft), ./ValueField, ./admin.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/concepts/admin-area.md §4 (League), §6, §9 piece 5
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { AdminNav } from './AdminNav.js';
import { LeagueCorrections, type CorrectionView } from './LeagueCorrections.js';
import type { Draft } from './PresetEditor.js';
import { ValueField, type ValueFieldView } from './ValueField.js';
import './admin.css';

interface LeagueView {
  readonly fields: readonly ValueFieldView[];
  readonly corrections: readonly CorrectionView[];
}

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

export function AdminLeague(): ReactElement {
  const [view, setView] = useState<LeagueView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    api<LeagueView>('/admin/league')
      .then((v) => {
        setView(v);
        setVersion((n) => n + 1);
      })
      .catch((e: unknown) => {
        setMessage(failure(e));
      });
  }, []);
  useEffect(reload, [reload]);
  const save = (values: Draft, comment: string): void => {
    setMessage(null);
    api('/admin/league', { method: 'POST', body: { values: Object.fromEntries(values), comment } })
      .then(() => {
        setMessage('Saved. It applies to matches that finish from now on.');
        reload();
      })
      .catch((e: unknown) => {
        setMessage(failure(e));
      });
  };
  return (
    <div className="admin-page sbr-stack" data-testid="admin-league">
      <h1>League</h1>
      <AdminNav current="league" />
      {message === null ? null : <p role="status">{message}</p>}
      {view === null ? null : (
        <>
          <LeagueValues key={version} fields={view.fields} onSave={save} />
          <LeagueCorrections corrections={view.corrections} onAdded={reload} />
        </>
      )}
    </div>
  );
}

// The league values, a comment for the History and Save (only the changed values).
function LeagueValues(props: {
  readonly fields: readonly ValueFieldView[];
  readonly onSave: (values: Draft, comment: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState<Draft>(new Map());
  const [comment, setComment] = useState('');
  return (
    <section className="sbr-panel sbr-stack" aria-labelledby="league-values-title">
      <h2 id="league-values-title">League points</h2>
      <p className="sbr-muted">
        A change applies to matches that finish afterwards; points already given stay.
      </p>
      {props.fields.map((f) => (
        <ValueField
          key={f.path}
          idPrefix="league"
          field={f}
          value={draft.has(f.path) ? draft.get(f.path) : f.value}
          onChange={(v) => {
            setDraft(new Map(draft).set(f.path, v));
          }}
        />
      ))}
      <label className="sbr-field">
        <span>Comment for the History (optional)</span>
        <input
          className="sbr-input"
          value={comment}
          data-testid="league-comment"
          onChange={(e) => {
            setComment(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="sbr-btn sbr-btn--primary"
        disabled={draft.size === 0}
        data-testid="league-save"
        onClick={() => {
          props.onSave(draft, comment);
        }}
      >
        Save the league points
      </button>
    </section>
  );
}
