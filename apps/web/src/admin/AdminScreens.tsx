/**
 * @file   apps/web/src/admin/AdminScreens.tsx
 * @module web/admin
 * @brief  The admin area's "Screens and texts": what players see that is not a rule.
 *
 * Responsibility: what GET /admin/screens answers — list sizes, how long a recap card shows,
 *                 how often the lobby and the maintenance state are asked for — as generated
 *                 fields (./SettingsValues); Save sends only the changed values (POST
 *                 /admin/screens). Screen values reach players at their next page load, list
 *                 sizes apply at once (admin-area §8 (i)). The server checks every value.
 * Depends on:     react, ../game/labels, ../shell/http, ./AdminNav, ./PresetEditor (Draft),
 *                 ./SettingsValues, ./ValueField (types), ./useAdminLoad, ./admin.css
 * Used by:        ./AdminArea
 * Spec:           docs/concepts/admin-area.md §4 (Screens and texts), §8 (i), §9 piece 6
 */
import { useCallback, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { AdminNav } from './AdminNav.js';
import type { Draft } from './PresetEditor.js';
import { SettingsValues } from './SettingsValues.js';
import { useAdminLoad } from './useAdminLoad.js';
import type { ValueFieldView } from './ValueField.js';
import './admin.css';

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

export function AdminScreens(): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  const failed = useCallback((e: unknown) => {
    setMessage(failure(e));
  }, []);
  const loaded = useAdminLoad<{ fields: readonly ValueFieldView[] }>('/admin/screens', failed);
  const { version, reload } = loaded;
  const fields = loaded.data?.fields ?? null;
  const save = (values: Draft, comment: string): void => {
    setMessage(null);
    api('/admin/screens', { method: 'POST', body: { values: Object.fromEntries(values), comment } })
      .then(() => {
        setMessage('Saved. Players see it after their next page load; list sizes apply at once.');
        reload();
      })
      .catch((e: unknown) => {
        setMessage(failure(e));
      });
  };
  return (
    <div className="admin-page sbr-stack" data-testid="admin-screens">
      <h1>Screens and texts</h1>
      <AdminNav current="screens" />
      {message === null ? null : <p role="status">{message}</p>}
      {fields === null ? null : (
        <SettingsValues
          key={version}
          title="What players see"
          intro="Lists, times and refresh rates. None of these changes a rule of the game."
          idPrefix="screens"
          saveLabel="Save the screen values"
          fields={fields}
          onSave={save}
        />
      )}
    </div>
  );
}
