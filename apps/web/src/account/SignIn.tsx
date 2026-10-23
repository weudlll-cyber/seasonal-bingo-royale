/**
 * @file   apps/web/src/account/SignIn.tsx
 * @module web/account
 * @brief  Sign in with e-mail and password; the way to Register.
 *
 * Responsibility: the sign-in form (e-mail, password), the server's refusal in plain words
 *                 (./accountText), then the lobby. A link leads to Register.
 * Depends on:     react, ../shell/session, ../shell/router, ./formParts, ./account.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §2.1; docs/spec/03-security-architecture.md §2.1
 */
import { useState, type ReactElement } from 'react';

import { hrefOf } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { AccountField, FormError, useAccountSubmit } from './formParts.js';
import './account.css';

export function SignIn(): ReactElement {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, submit } = useAccountSubmit(() => signIn(email.trim(), password));
  return (
    <form className="sbr-panel account-form" onSubmit={submit} data-testid="sign-in-form">
      <h1>Sign in</h1>
      <AccountField
        label="E-mail"
        type="email"
        autoComplete="email"
        value={email}
        testId="sign-in-email"
        onChange={setEmail}
      />
      <AccountField
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        testId="sign-in-password"
        onChange={setPassword}
      />
      <FormError text={error} testId="sign-in-error" />
      <button
        type="submit"
        className="sbr-btn sbr-btn--primary"
        disabled={busy}
        data-testid="sign-in-submit"
      >
        Sign in
      </button>
      <p className="sbr-muted">
        No account yet? <a href={hrefOf({ name: 'register' })}>Register</a>
      </p>
    </form>
  );
}
