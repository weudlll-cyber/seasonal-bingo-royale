/**
 * @file   apps/web/src/admin/AdminLeague.tsx
 * @module web/admin
 * @brief  The admin area's League: the league values, and corrections of a player's points.
 *
 * Responsibility: what GET /admin/league answers: the league values as generated fields
 *                 (./SettingsValues, ./ValueField: name, what it does, unit, built-in value, technical limit), a
 *                 comment and Save, which sends only the changed values (POST /admin/league)
 *                 and applies to matches whose points are awarded afterwards; below, the
 *                 corrections (./LeagueCorrections). The server checks every value and
 *                 permission; the page shows what it answered or why it refused.
 * Depends on:     react, ../game/labels, ../shell/http, ./AdminNav, ./LeagueCorrections,
 *                 ./PresetEditor (Draft), ./SettingsValues, ./ValueField (types), ./useAdminLoad,
 *                 ./admin.css
 * Used by:        ./AdminArea
 * Spec:           docs/concepts/admin-area.md §4 (League), §6, §9 piece 5
 */
import { useCallback, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { AdminNav } from './AdminNav.js';
import { LeagueCorrections, type CorrectionView } from './LeagueCorrections.js';
import type { Draft } from './PresetEditor.js';
import { SettingsValues } from './SettingsValues.js';
import { useAdminLoad } from './useAdminLoad.js';
import type { ValueFieldView } from './ValueField.js';
import './admin.css';

interface LeagueView {
  readonly fields: readonly ValueFieldView[];
  readonly corrections: readonly CorrectionView[];
}

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

export function AdminLeague(): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const failed = useCallback((e: unknown) => {
    setMessage(failure(e));
  }, []);
  const { data: view, version, reload } = useAdminLoad<LeagueView>('/admin/league', failed);
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
          <SettingsValues
            key={version}
            title="League points"
            intro="A change applies to matches that finish afterwards; points already given stay."
            idPrefix="league"
            saveLabel="Save the league points"
            fields={view.fields}
            onSave={save}
          />
          <LeagueCorrections corrections={view.corrections} onAdded={reload} />
        </>
      )}
    </div>
  );
}
