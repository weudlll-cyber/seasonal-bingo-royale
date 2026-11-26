/**
 * @file   apps/web/src/admin/SettingsValues.tsx
 * @module web/admin
 * @brief  A page's plain values as generated fields, a comment for the History and Save.
 *
 * Responsibility: the values the server sent (./ValueField each: name, what it does, unit,
 *                 built-in value, technical limit), what the person typed kept apart from them,
 *                 a comment and Save, which hands over only the changed values; used by the
 *                 League and "Screens and texts" (admin-area §4).
 * Depends on:     react, ./PresetEditor (Draft), ./ValueField
 * Used by:        ./AdminLeague, ./AdminScreens
 * Spec:           docs/concepts/admin-area.md §4, §9 pieces 5 and 6
 */
import { useState, type ReactElement } from 'react';

import type { Draft } from './PresetEditor.js';
import { ValueField, type ValueFieldView } from './ValueField.js';

// The values, a comment for the History and Save (only the changed values).
export function SettingsValues(props: {
  readonly title: string;
  readonly intro: string;
  // The test ids start with it: "league-place1", "league-save".
  readonly idPrefix: string;
  readonly saveLabel: string;
  readonly fields: readonly ValueFieldView[];
  readonly onSave: (values: Draft, comment: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState<Draft>(new Map());
  const [comment, setComment] = useState('');
  return (
    <section className="sk-panel sbr-stack" aria-labelledby={`${props.idPrefix}-values-title`}>
      <h2 id={`${props.idPrefix}-values-title`}>{props.title}</h2>
      <p className="sbr-muted">{props.intro}</p>
      {props.fields.map((f) => (
        <ValueField
          key={f.path}
          idPrefix={props.idPrefix}
          field={f}
          value={draft.has(f.path) ? draft.get(f.path) : f.value}
          onChange={(v) => {
            setDraft(new Map(draft).set(f.path, v));
          }}
        />
      ))}
      <label className="sk-field">
        <span>Comment for the History (optional)</span>
        <input
          className="sk-input"
          value={comment}
          data-testid={`${props.idPrefix}-comment`}
          onChange={(e) => {
            setComment(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="sk-btn sk-btn--primary"
        disabled={draft.size === 0}
        data-testid={`${props.idPrefix}-save`}
        onClick={() => {
          props.onSave(draft, comment);
        }}
      >
        {props.saveLabel}
      </button>
    </section>
  );
}
