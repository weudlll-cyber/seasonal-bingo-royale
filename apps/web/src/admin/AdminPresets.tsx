/**
 * @file   apps/web/src/admin/AdminPresets.tsx
 * @module web/admin
 * @brief  The admin area's Presets: pick a preset, change its rules, duplicate, publish, retire.
 *
 * Responsibility: what GET /admin/presets answers: a list of the presets with their kind and
 *                 status; for the chosen one its rules in tabs (./PresetEditor), "Publish" or
 *                 "Retire", and "Duplicate" under a new name (a draft until published). Every
 *                 action posts to the server, which checks the permission and the rules and
 *                 refuses to retire the last published preset of a kind; the page shows the
 *                 preset the server answered, or the refusal as a sentence.
 * Depends on:     react, ../game/labels, ../shell/http, ./AdminNav, ./PresetEditor,
 *                 ./presetText, ./admin.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §6, §8 (b), §9 piece 3
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { AdminNav } from './AdminNav.js';
import { PresetEditor, type Draft, type PresetFieldView } from './PresetEditor.js';
import { kindOf, STATUS_NAMES } from './presetText.js';
import './admin.css';

interface PresetView {
  readonly id: string;
  readonly name: string;
  readonly gameType: string;
  readonly mode: string;
  readonly status: string;
  readonly fields: readonly PresetFieldView[];
}

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

// The list, the chosen preset, and each action with its answer or refusal.
function usePresets() {
  const [list, setList] = useState<readonly PresetView[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    api<{ presets: PresetView[] }>('/admin/presets')
      .then((r) => {
        setList(r.presets);
      })
      .catch((e: unknown) => {
        setMessage(failure(e));
      });
  }, []);
  const send = useCallback((path: string, body: object, done: string) => {
    setBusy(true);
    setMessage(null);
    api<{ preset: PresetView }>(`/admin/presets/${path}`, { method: 'POST', body })
      .then(({ preset }) => {
        setList((now) =>
          [...(now ?? []).filter((p) => p.id !== preset.id), preset].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        );
        setChosen(preset.id);
        setVersion((v) => v + 1);
        setMessage(done);
      })
      .catch((e: unknown) => {
        setMessage(failure(e));
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);
  const current = list?.find((p) => p.id === chosen) ?? list?.[0] ?? null;
  return { list, current, setChosen, message, busy, version, send };
}

export function AdminPresets(): ReactElement {
  const { list, current, setChosen, message, busy, version, send } = usePresets();
  const save = (values: Draft, comment: string): void => {
    if (current === null) return;
    send(
      current.id,
      { values: Object.fromEntries(values), comment },
      'Saved. New matches use these rules.',
    );
  };
  return (
    <div className="admin-page sbr-stack" data-testid="admin-presets">
      <h1>Presets</h1>
      <AdminNav current="presets" />
      {message === null ? null : <p role="status">{message}</p>}
      {list === null || current === null ? null : (
        <>
          <section className="sbr-panel sbr-stack" aria-labelledby="preset-pick-title">
            <h2 id="preset-pick-title">Preset</h2>
            <label className="sbr-field">
              <span>Preset to edit</span>
              <select
                className="sbr-select"
                value={current.id}
                data-testid="preset-pick"
                onChange={(e) => {
                  setChosen(e.target.value);
                }}
              >
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {STATUS_NAMES[p.status] ?? p.status}
                  </option>
                ))}
              </select>
            </label>
            <PresetActions preset={current} busy={busy} send={send} />
          </section>
          <PresetEditor
            key={`${current.id}-${String(version)}`}
            fields={current.fields}
            busy={busy}
            onSave={save}
          />
        </>
      )}
    </div>
  );
}

// Publish or retire the preset, or duplicate it under a new name.
function PresetActions(props: {
  readonly preset: PresetView;
  readonly busy: boolean;
  readonly send: (path: string, body: object, done: string) => void;
}): ReactElement {
  const p = props.preset;
  const [name, setName] = useState('');
  const published = p.status === 'published';
  return (
    <div className="sbr-stack">
      <p>
        {kindOf(p)} · <strong>{STATUS_NAMES[p.status] ?? p.status}</strong>
      </p>
      <button
        type="button"
        className="sbr-btn"
        disabled={props.busy}
        data-testid="preset-status"
        onClick={() => {
          props.send(
            `${p.id}/status`,
            { status: published ? 'retired' : 'published' },
            published ? 'Retired. New matches no longer use it.' : 'Published. New matches use it.',
          );
        }}
      >
        {published ? 'Retire' : 'Publish'}
      </button>
      <label className="sbr-field">
        <span>Name of the copy</span>
        <input
          className="sbr-input"
          value={name}
          data-testid="preset-copy-name"
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="sbr-btn"
        disabled={props.busy || name.trim().length < 3}
        onClick={() => {
          props.send(`${p.id}/duplicate`, { name }, 'Copied as a draft.');
          setName('');
        }}
      >
        Duplicate
      </button>
    </div>
  );
}
