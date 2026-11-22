/**
 * @file   apps/web/src/admin/AdminTechnical.tsx
 * @module web/admin
 * @brief  The admin area's Technical section: a warning, the values, and the second step again.
 *
 * Responsibility: a warning at the top (admin-area §8 (c)); what GET /admin/technical answers —
 *                 session lengths, the reset link's lifetime, rate limits, socket caps — as
 *                 generated fields with their hard limits (./SettingsValues); Save sends only the
 *                 changed values (POST /admin/technical) and they apply at once. When the server
 *                 asks for the second step again (STEP_UP_REQUIRED, standalone), the page asks
 *                 for the code from the authenticator app or a recovery code, sends it (POST
 *                 /auth/2fa/step-up) and saves again. The server decides who may see and change
 *                 the section (the owner; website admins in website mode).
 * Depends on:     react, ../game/labels, ../shell/http, ./AdminNav, ./PresetEditor (Draft),
 *                 ./SettingsValues, ./StepUp, ./ValueField (types), ./useAdminLoad, ./admin.css
 * Used by:        ./AdminArea
 * Spec:           docs/concepts/admin-area.md §4 (Technical), §7, §8 (c), (e), §9 piece 7
 */
import { useCallback, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { AdminNav } from './AdminNav.js';
import type { Draft } from './PresetEditor.js';
import { SettingsValues } from './SettingsValues.js';
import { StepUp } from './StepUp.js';
import { useAdminLoad } from './useAdminLoad.js';
import type { ValueFieldView } from './ValueField.js';
import './admin.css';

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

interface Change {
  readonly values: Draft;
  readonly comment: string;
}

// The values, saving, and a change waiting for the second step.
function useTechnical() {
  const [message, setMessage] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Change | null>(null);
  const failed = useCallback((e: unknown) => {
    setMessage(failure(e));
  }, []);
  const loaded = useAdminLoad<{ fields: readonly ValueFieldView[] }>('/admin/technical', failed);
  const { version, reload } = loaded;
  const fields = loaded.data?.fields ?? null;
  const save = (c: Change): void => {
    setMessage(null);
    const body = { values: Object.fromEntries(c.values), comment: c.comment };
    api('/admin/technical', { method: 'POST', body })
      .then(() => {
        setWaiting(null);
        setMessage('Saved. It applies at once.');
        reload();
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'STEP_UP_REQUIRED') setWaiting(c);
        else setMessage(failure(e));
      });
  };
  return { fields, message, setMessage, waiting, version, save };
}

export function AdminTechnical(): ReactElement {
  const { fields, message, setMessage, waiting, version, save } = useTechnical();
  return (
    <div className="admin-page sbr-stack" data-testid="admin-technical">
      <h1>Technical</h1>
      <AdminNav current="technical" />
      <p className="admin-warning" role="note">
        These values decide how sign-in, sessions and the live connections work for everyone. A
        wrong value can lock players out or let attacks through. Each value has a hard limit; a
        change applies at once and is listed in the History.
      </p>
      {message === null ? null : <p role="status">{message}</p>}
      {waiting === null ? null : (
        <StepUp
          onPassed={() => {
            save(waiting);
          }}
          onFailed={setMessage}
        />
      )}
      {fields === null ? null : (
        <SettingsValues
          key={version}
          title="Sign-in, sessions and connections"
          intro="Rate limits count per window: 15 minutes for sign-in tries and codes, an hour for accounts, guests and resets, a minute for requests."
          idPrefix="technical"
          saveLabel="Save the technical values"
          fields={fields}
          onSave={(values, comment) => {
            save({ values, comment });
          }}
        />
      )}
    </div>
  );
}
