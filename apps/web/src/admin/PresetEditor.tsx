/**
 * @file   apps/web/src/admin/PresetEditor.tsx
 * @module web/admin
 * @brief  One preset's values in tabs, each with what it does, its unit, limits and default.
 *
 * Responsibility: the tabs that have values for this preset (a classic preset has no stages
 *                 or jackpot); per value its name (with "Stage 2" / "Spring" where it sits),
 *                 its warning, the input in the shown unit (seconds for milliseconds), what
 *                 changing it does, the built-in default and the technical limit the server
 *                 sent; a comment for the History and Save, which sends only the changed values
 *                 (POST /admin/presets/:id). The server checks and stores; the page shows what
 *                 it answered. A change applies to matches created afterwards.
 * Depends on:     react, @sbr/contracts (types), ./presetText
 * Used by:        ./AdminPresets
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §8 (b), §9 piece 3
 */
import type { PresetField, PresetTab } from '@sbr/contracts';
import { useState, type ReactElement } from 'react';

import { placeOf, shownValue } from './presetText.js';

export interface PresetFieldView extends PresetField {
  readonly value: unknown;
  readonly default: unknown;
}

const TAB_NAMES: readonly [PresetTab, string][] = [
  ['draws', 'Draws and timing'],
  ['marking', 'Marking and speed'],
  ['scoring', 'Scoring and patterns'],
  ['seasons', 'Seasons and effects'],
  ['stages', 'Stages and cuts'],
  ['jackpot', 'Jackpot'],
  ['lobby', 'Lobby and players'],
];

export type Draft = ReadonlyMap<string, unknown>;

export function PresetEditor(props: {
  readonly fields: readonly PresetFieldView[];
  readonly busy: boolean;
  readonly onSave: (values: Draft, comment: string) => void;
}): ReactElement {
  const tabs = TAB_NAMES.filter(([t]) => props.fields.some((f) => f.tab === t));
  const [tab, setTab] = useState<PresetTab>(tabs[0]?.[0] ?? 'draws');
  const [draft, setDraft] = useState<Draft>(new Map());
  const [comment, setComment] = useState('');
  return (
    <section className="sbr-panel sbr-stack" aria-labelledby="preset-values-title">
      <h2 id="preset-values-title">Rules</h2>
      <p className="sbr-muted">
        A change applies to matches created afterwards; running matches keep their rules.
      </p>
      <TabBar tabs={tabs} current={tab} onPick={setTab} />
      {props.fields
        .filter((f) => f.tab === tab)
        .map((f) => (
          <FieldRow
            key={f.path}
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
          data-testid="preset-comment"
          onChange={(e) => {
            setComment(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="sbr-btn sbr-btn--primary"
        disabled={draft.size === 0 || props.busy}
        data-testid="preset-save"
        onClick={() => {
          props.onSave(draft, comment);
        }}
      >
        Save the rules
      </button>
    </section>
  );
}

// The tabs this preset has values in, the current one pressed.
function TabBar(props: {
  readonly tabs: readonly [PresetTab, string][];
  readonly current: PresetTab;
  readonly onPick: (t: PresetTab) => void;
}): ReactElement {
  return (
    <div className="admin-nav" role="group" aria-label="Rules">
      {props.tabs.map(([t, name]) => (
        <button
          key={t}
          type="button"
          className="sbr-chip"
          aria-pressed={t === props.current}
          onClick={() => {
            props.onPick(t);
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

// "Built in: 3 s · technical limit 2 s – 60 s".
function limitsLine(f: PresetFieldView): string {
  const show = (v: number | undefined) => shownValue(v, f.unit, f.scale);
  const range =
    f.min === undefined && f.max === undefined
      ? ''
      : ` · technical limit ${show(f.min)} – ${show(f.max)}`;
  return `Built in: ${shownValue(f.default, f.unit, f.scale)}${range}`;
}

// One value: its name and warning, the input in the shown unit, what it does, its limits.
function FieldRow(props: {
  readonly field: PresetFieldView;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
}): ReactElement {
  const f = props.field;
  const id = `preset-${f.path.replaceAll('.', '-')}`;
  return (
    <div className="admin-field sbr-stack" data-testid={id}>
      <label htmlFor={id}>
        <strong>
          {placeOf(f.path)}
          {f.label}
        </strong>
      </label>
      {f.warning === undefined ? null : <p className="admin-warning">{f.warning}</p>}
      <div className="admin-field-input">
        <FieldInput id={id} field={f} value={props.value} onChange={props.onChange} />
        {f.unit === '' || f.kind !== 'number' ? null : <span>{f.unit}</span>}
      </div>
      <p className="sbr-muted admin-match-facts">{f.description}</p>
      <p className="sbr-muted admin-match-facts">{limitsLine(f)}</p>
    </div>
  );
}

function FieldInput(props: {
  readonly id: string;
  readonly field: PresetFieldView;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
}): ReactElement {
  const f = props.field;
  if (f.kind === 'boolean')
    return (
      <input
        id={props.id}
        type="checkbox"
        checked={props.value === true}
        onChange={(e) => {
          props.onChange(e.target.checked);
        }}
      />
    );
  if (f.kind === 'choice')
    return (
      <select
        id={props.id}
        className="sbr-select"
        value={String(props.value)}
        onChange={(e) => {
          props.onChange(e.target.value);
        }}
      >
        {(f.options ?? []).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  const shown = typeof props.value === 'number' ? Number((props.value / f.scale).toFixed(3)) : '';
  return (
    <input
      id={props.id}
      className="sbr-input"
      type="number"
      step="any"
      min={f.min === undefined ? undefined : f.min / f.scale}
      max={f.max === undefined ? undefined : f.max / f.scale}
      value={shown}
      onChange={(e) => {
        props.onChange(Math.round(Number(e.target.value) * f.scale * 1000) / 1000);
      }}
    />
  );
}
