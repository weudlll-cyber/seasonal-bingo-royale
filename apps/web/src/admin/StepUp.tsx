/**
 * @file   apps/web/src/admin/StepUp.tsx
 * @module web/admin
 * @brief  "Confirm it is you": the second step again before a change (standalone installs).
 *
 * Responsibility: when the server answers STEP_UP_REQUIRED (the last second step is more than
 *                 10 minutes old, admin-area §7 row 10), the code from the authenticator app or
 *                 a recovery code, sent to POST /auth/2fa/step-up; on success the page repeats
 *                 the change it was making, on failure it says why.
 * Depends on:     react, ../game/labels, ../shell/http
 * Used by:        ./AdminTechnical, ./AdminAccounts
 * Spec:           docs/concepts/admin-area.md §7, §9 pieces 7 and 8
 */
import { useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

// The second step again: a code from the authenticator app (or a recovery code).
export function StepUp(props: {
  readonly onPassed: () => void;
  readonly onFailed: (message: string) => void;
}): ReactElement {
  const [code, setCode] = useState('');
  const send = (): void => {
    const answer = code.trim();
    const body = /^\d{6}$/.test(answer) ? { code: answer } : { recoveryCode: answer };
    api('/auth/2fa/step-up', { method: 'POST', body })
      .then(props.onPassed)
      .catch((e: unknown) => {
        props.onFailed(failure(e));
      });
  };
  return (
    <section className="sk-panel sbr-stack" aria-labelledby="step-up-title" data-testid="step-up">
      <h2 id="step-up-title">Confirm it is you</h2>
      <p>
        Your last confirmation is more than 10 minutes old. Enter the code from your authenticator
        app, or a recovery code.
      </p>
      <label className="sk-field">
        <span>Code</span>
        <input
          className="sk-input"
          autoComplete="one-time-code"
          value={code}
          data-testid="step-up-code"
          onChange={(e) => {
            setCode(e.target.value);
          }}
        />
      </label>
      <button
        type="button"
        className="sk-btn sk-btn--primary"
        disabled={code.trim() === ''}
        onClick={send}
      >
        Confirm and save
      </button>
    </section>
  );
}
