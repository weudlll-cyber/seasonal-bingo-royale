/**
 * @file   apps/web/src/account/formParts.tsx
 * @module web/account
 * @brief  What the sign-in and register forms share: a labelled field and the submit flow.
 *
 * Responsibility: `AccountField` — label, input, optional hint; `useAccountSubmit` — runs the
 *                 server call once (busy while it runs), shows the refusal as a sentence
 *                 (./accountText) and goes to the lobby when it succeeds; `FormError`.
 * Depends on:     react, ../shell/router, ./accountText
 * Used by:        ./SignIn, ./Register
 * Spec:           docs/spec/05-api-design.md §2.1
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import { navigate } from '../shell/router.js';
import { accountError } from './accountText.js';

export interface AccountFieldProps {
  readonly label: string;
  readonly type: 'text' | 'email' | 'password';
  readonly autoComplete: string;
  readonly value: string;
  readonly testId: string;
  readonly hint?: string;
  readonly onChange: (value: string) => void;
}

export function AccountField(p: AccountFieldProps): ReactElement {
  return (
    <label className="sbr-field">
      <span>{p.label}</span>
      <input
        className="sbr-input"
        type={p.type}
        autoComplete={p.autoComplete}
        value={p.value}
        data-testid={p.testId}
        onChange={(e) => {
          p.onChange(e.target.value);
        }}
      />
      {p.hint === undefined ? null : <small className="sbr-muted">{p.hint}</small>}
    </label>
  );
}

// `check` returns a sentence for a form that must not be sent yet, else null.
export function useAccountSubmit(
  action: () => Promise<void>,
  check: () => string | null = () => null,
): {
  readonly error: string | null;
  readonly busy: boolean;
  readonly submit: (event: SyntheticEvent) => void;
} {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const problem = check();
    setError(problem);
    if (problem !== null) return;
    setBusy(true);
    action()
      .then(() => {
        navigate({ name: 'lobby' });
      })
      .catch((e: unknown) => {
        setError(accountError(e));
        setBusy(false);
      });
  };
  return { error, busy, submit };
}

export function FormError({
  text,
  testId,
}: {
  readonly text: string | null;
  readonly testId: string;
}) {
  return text === null ? null : (
    <p className="lobby-error" role="alert" data-testid={testId}>
      {text}
    </p>
  );
}
