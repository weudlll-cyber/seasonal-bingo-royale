/**
 * @file   apps/web/src/account/PasswordReset.tsx
 * @module web/account
 * @brief  "Forgot password?": ask for the link, then set a new password from it (D60).
 *
 * Responsibility: ForgotPassword sends the e-mail address and always says the same: if an
 *                 account has it, a link is on its way (the server reveals nothing).
 *                 ResetPassword reads the token from the link (#/reset-password?token=…), takes
 *                 the new password twice and shows the server's answer: done (every session of
 *                 the account was ended, sign in again), a weak password, or a link that is
 *                 used or expired. Standalone installs with mail only (the sign-in page shows
 *                 the link when the server says so).
 * Depends on:     react, ../shell/http, ../shell/router, ./accountText, ./formParts
 * Used by:        ../shell/AppShell, ./SignIn
 * Spec:           docs/spec/03-security-architecture.md §1; docs/spec/05-api-design.md §2.1
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import { api } from '../shell/http.js';
import { hrefOf } from '../shell/router.js';
import { accountError } from './accountText.js';
import { AccountField, FormError } from './formParts.js';
import './account.css';

// Runs the request; null while idle, the sentence once answered.
function useSend(action: () => Promise<string>) {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    action()
      .then(setDone)
      .catch((e: unknown) => {
        setError(accountError(e));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { done, error, busy, submit };
}

export function ForgotPassword(): ReactElement {
  const [email, setEmail] = useState('');
  const { done, error, busy, submit } = useSend(async () => {
    await api('/auth/password-reset', { method: 'POST', body: { email: email.trim() } });
    return 'If an account uses this e-mail address, a link to choose a new password is on its way. It works for one hour.';
  });
  return (
    <form className="sbr-panel account-form" onSubmit={submit} data-testid="forgot-form">
      <h1>Forgot your password?</h1>
      {done === null ? (
        <>
          <AccountField
            label="E-mail"
            type="email"
            autoComplete="email"
            value={email}
            testId="forgot-email"
            onChange={setEmail}
          />
          <FormError text={error} testId="forgot-error" />
          <button
            type="submit"
            className="sbr-btn sbr-btn--primary"
            disabled={busy}
            data-testid="forgot-submit"
          >
            Send the link
          </button>
        </>
      ) : (
        <p role="status" data-testid="forgot-sent">
          {done}
        </p>
      )}
      <p className="sbr-muted">
        <a href={hrefOf({ name: 'signIn' })}>Back to sign in</a>
      </p>
    </form>
  );
}

// The token in "#/reset-password?token=…".
const tokenFromHash = (): string =>
  new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? '';

export function ResetPassword(): ReactElement {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const { done, error, busy, submit } = useSend(async () => {
    if (password !== again) throw new Error('mismatch');
    await api('/auth/password-reset/complete', {
      method: 'POST',
      body: { token: tokenFromHash(), password },
    });
    return 'Your new password is set. Every device was signed out; sign in again with it.';
  });
  const shown =
    error === 'Something went wrong — please try again.' && password !== again
      ? 'The two passwords differ.'
      : error;
  return (
    <form className="sbr-panel account-form" onSubmit={submit} data-testid="reset-form">
      <h1>Choose a new password</h1>
      {done === null ? (
        <>
          <AccountField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            testId="reset-password"
            onChange={setPassword}
          />
          <AccountField
            label="New password again"
            type="password"
            autoComplete="new-password"
            value={again}
            testId="reset-again"
            onChange={setAgain}
          />
          <FormError text={shown} testId="reset-error" />
          <button
            type="submit"
            className="sbr-btn sbr-btn--primary"
            disabled={busy}
            data-testid="reset-submit"
          >
            Set the new password
          </button>
        </>
      ) : (
        <p role="status" data-testid="reset-done">
          {done} <a href={hrefOf({ name: 'signIn' })}>Sign in</a>
        </p>
      )}
    </form>
  );
}
