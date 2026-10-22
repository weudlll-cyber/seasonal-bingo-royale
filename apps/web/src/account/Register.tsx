/**
 * @file   apps/web/src/account/Register.tsx
 * @module web/account
 * @brief  Create an account: display name, e-mail, password; then signed in, in the lobby.
 *
 * Responsibility: the register form with the spec's rules shown and checked before sending
 *                 (./accountText), the server's refusal in plain words, then the lobby
 *                 (the server signs the new account in). E-mail verification stays behind
 *                 its feature flag. A link leads to Sign in.
 * Depends on:     react, ../shell/session, ../shell/router, ./accountText, ./formParts,
 *                 ./account.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §2.1
 */
import { useState, type ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { registerProblem, type RegisterValues } from './accountText.js';
import { AccountField, FormError, useAccountSubmit } from './formParts.js';
import './account.css';

export function Register(): ReactElement {
  const { register } = useSession();
  const [v, setV] = useState<RegisterValues>({ displayName: '', email: '', password: '' });
  const set = (key: keyof RegisterValues) => (value: string) => {
    setV((old) => ({ ...old, [key]: value }));
  };
  const { error, busy, submit } = useAccountSubmit(
    () => register({ ...v, displayName: v.displayName.trim(), email: v.email.trim() }),
    () => registerProblem(v),
  );
  return (
    <form className="sbr-panel account-form" onSubmit={submit} data-testid="register-form">
      <h1>Register</h1>
      <AccountField
        label="Display name"
        type="text"
        autoComplete="nickname"
        value={v.displayName}
        testId="register-displayName"
        hint="3 to 24 letters or digits; shown to other players"
        onChange={set('displayName')}
      />
      <AccountField
        label="E-mail"
        type="email"
        autoComplete="email"
        value={v.email}
        testId="register-email"
        hint="Never shown to other players"
        onChange={set('email')}
      />
      <AccountField
        label="Password"
        type="password"
        autoComplete="new-password"
        value={v.password}
        testId="register-password"
        hint="At least 12 characters"
        onChange={set('password')}
      />
      <FormError text={error} testId="register-error" />
      <button
        type="submit"
        className="sbr-btn sbr-btn--primary"
        disabled={busy}
        data-testid="register-submit"
      >
        Create account
      </button>
      <p className="sbr-muted">
        Already have an account? <a href={hrefOf({ name: 'signIn' })}>Sign in</a>
      </p>
    </form>
  );
}
