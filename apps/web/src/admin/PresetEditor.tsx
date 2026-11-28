/**
 * @file   apps/web/src/admin/PresetEditor.tsx
 * @module web/admin
 * @brief  One preset's values in tabs, each with what it does, its unit, limits and default.
 *
 * Responsibility: the tabs that have values for this preset (first "For the organizer": what
 *                 the Organizer's page offers, piece 4; a classic preset has no stages or
 *                 jackpot); per value its name (with "Stage 2" / "Spring" where it sits),
 *                 its warning, the input in the shown unit (seconds for milliseconds), what
 *                 changing it does, the built-in default and the technical limit the server
 *                 sent; a comment for the History and Save, which sends only the changed values
 *                 (POST /admin/presets/:id). The server checks and stores; the page shows what
 *                 it answered. A change applies to matches created afterwards.
 * Depends on:     react, @sbr/contracts (types), ./ValueField
 * Used by:        ./AdminPresets
 * Spec:           docs/concepts/admin-area.md §4 (Presets), §8 (b), §9 piece 3
 */
import type { PresetField, PresetTab } from '@sbr/contracts';
import { useState, type ReactElement } from 'react';

import { ValueField, type ValueFieldView } from './ValueField.js';

export type PresetFieldView = PresetField & ValueFieldView;

const TAB_NAMES: readonly [PresetTab, string][] = [
  ['organizer', 'For the organizer'],
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
  // The tab the page remembers (a save remounts the editor); the first one this preset has
  // when it has none of that tab.
  readonly tab: PresetTab | null;
  readonly onTab: (t: PresetTab) => void;
}): ReactElement {
  const tabs = TAB_NAMES.filter(([t]) => props.fields.some((f) => f.tab === t));
  const tab = tabs.find(([t]) => t === props.tab)?.[0] ?? tabs[0]?.[0] ?? 'draws';
  const setTab = props.onTab;
  const [draft, setDraft] = useState<Draft>(new Map());
  const [comment, setComment] = useState('');
  return (
    <section className="sk-panel sbr-stack" aria-labelledby="preset-values-title">
      <h2 id="preset-values-title">Rules</h2>
      <p className="sbr-muted">
        A change applies to matches created afterwards; running matches keep their rules.
      </p>
      <TabBar tabs={tabs} current={tab} onPick={setTab} />
      {props.fields
        .filter((f) => f.tab === tab)
        .map((f) => (
          <ValueField
            idPrefix="preset"
            key={f.path}
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
          data-testid="preset-comment"
          onChange={(e) => {
            setComment(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="sk-btn sk-btn--primary"
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
          className="sk-chip"
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
