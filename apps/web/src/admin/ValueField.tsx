/**
 * @file   apps/web/src/admin/ValueField.tsx
 * @module web/admin
 * @brief  One value of a generated admin form: name, warning, input in its unit, limits.
 *
 * Responsibility: a value as the server sends it (@sbr/contracts PresetField / SettingField
 *                 with its current value and default): its name (with "Stage 2" / "Spring"
 *                 where it sits), its warning, the input (a number in the shown unit — seconds
 *                 for milliseconds —, a yes/no box, a choice or a line of text), what changing
 *                 it does, and "Built in: … · technical limit …". The server checks and stores.
 * Depends on:     react, @sbr/contracts (types), ../game/labels (unitFor), ./presetText
 * Used by:        ./PresetEditor, ./SettingsValues
 * Spec:           docs/concepts/admin-area.md §4, §9 pieces 3 and 5
 */
import type { SettingField } from '@sbr/contracts';
import type { ReactElement } from 'react';

import { unitFor } from '../game/labels.js';
import { placeOf, shownValue } from './presetText.js';

export interface ValueFieldView extends SettingField {
  readonly value: unknown;
  readonly default: unknown;
}

// "Built in: 3 s · technical limit 2 s – 60 s".
function limitsLine(f: ValueFieldView): string {
  if (f.kind === 'text') return `At most ${String(f.max ?? 0)} characters`;
  const show = (v: number | undefined) => shownValue(v, f.unit, f.scale);
  const range =
    f.min === undefined && f.max === undefined
      ? ''
      : ` · technical limit ${show(f.min)} – ${show(f.max)}`;
  return `Built in: ${shownValue(f.default, f.unit, f.scale)}${range}`;
}

// One value: its name and warning, the input in the shown unit, what it does, its limits.
export function ValueField(props: {
  // The test id and input id start with it: "preset-draws-intervalMsRealtime".
  readonly idPrefix: string;
  readonly field: ValueFieldView;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
}): ReactElement {
  const f = props.field;
  const id = `${props.idPrefix}-${f.path.replaceAll('.', '-')}`;
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
        {f.unit === '' || f.kind !== 'number' ? null : (
          <span>
            {unitFor(typeof props.value === 'number' ? props.value / f.scale : 0, f.unit)}
          </span>
        )}
      </div>
      <p className="sbr-muted admin-match-facts">{f.description}</p>
      <p className="sbr-muted admin-match-facts">{limitsLine(f)}</p>
    </div>
  );
}

function FieldInput(props: {
  readonly id: string;
  readonly field: ValueFieldView;
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
  if (f.kind === 'text') return <TextInput {...props} />;
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

// The Organizer's line of what is special: plain text up to the schema's length.
function TextInput(props: {
  readonly id: string;
  readonly field: ValueFieldView;
  readonly value: unknown;
  readonly onChange: (v: unknown) => void;
}): ReactElement {
  return (
    <input
      id={props.id}
      className="sbr-input"
      maxLength={props.field.max}
      value={typeof props.value === 'string' ? props.value : ''}
      onChange={(e) => {
        props.onChange(e.target.value);
      }}
    />
  );
}
