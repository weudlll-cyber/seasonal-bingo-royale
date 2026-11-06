/**
 * @file   apps/web/src/account/TwoFactor.tsx
 * @module web/account
 * @brief  An admin's second sign-in step in a standalone install (TOTP, D60).
 *
 * Responsibility: shown instead of every screen while the session waits for it. Enrolment:
 *                 the QR code and the secret for an authenticator app (from the server), one
 *                 code to confirm, then the ten recovery codes shown once with "I have saved
 *                 them". Later sign-ins: the 6-digit code, or a recovery code instead. Wrong
 *                 answers and too many tries say so. The server decides; the page only sends.
 * Depends on:     react, ../shell/http, ../shell/session, ./formParts, ./account.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import { useEffect, useState, type ReactElement, type SyntheticEvent } from 'react';

import { api, ApiError } from '../shell/http.js';
import { useSession } from '../shell/session.js';
import { AccountField, FormError } from './formParts.js';
import './account.css';

const problem = (e: unknown): string =>
  e instanceof ApiError && e.code === 'RATE_LIMITED'
    ? 'Too many tries. Please wait a few minutes.'
    : 'That did not match. Check the code and try again.';

function Enrol({ done }: { readonly done: (codes: readonly string[]) => void }): ReactElement {
  const [qr, setQr] = useState<{ uri: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void api<{ uri: string; qrSvg: string }>('/auth/2fa/enrol', { method: 'POST', body: {} }).then(
      setQr,
    );
  }, []);
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    api<{ recoveryCodes: string[] }>('/auth/2fa/confirm', {
      method: 'POST',
      body: { code: code.trim() },
    })
      .then((r) => {
        done(r.recoveryCodes);
      })
      .catch((e: unknown) => {
        setError(problem(e));
      });
  };
  const secret = qr === null ? '' : (new URL(qr.uri).searchParams.get('secret') ?? '');
  return (
    <form className="sbr-panel account-form" onSubmit={submit} data-testid="tfa-enrol">
      <h1>Set up two-factor sign-in</h1>
      <p>
        Admin accounts sign in with a code from an authenticator app. Scan this code with the app,
        or type the key.
      </p>
      {qr === null ? null : (
        <>
          <img
            className="tfa-qr"
            alt="QR code for the authenticator app"
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.qrSvg)}`}
          />
          <p className="tfa-secret" data-testid="tfa-secret">
            {secret}
          </p>
        </>
      )}
      <AccountField
        label="Code from the app"
        type="text"
        autoComplete="one-time-code"
        value={code}
        testId="tfa-code"
        onChange={setCode}
      />
      <FormError text={error} testId="tfa-error" />
      <button type="submit" className="sbr-btn sbr-btn--primary" data-testid="tfa-submit">
        Confirm
      </button>
    </form>
  );
}

function Codes({
  codes,
  onDone,
}: {
  readonly codes: readonly string[];
  readonly onDone: () => void;
}): ReactElement {
  return (
    <section className="sbr-panel account-form" data-testid="tfa-recovery">
      <h1>Your recovery codes</h1>
      <p>
        Each one signs you in once if the app is lost. Keep them somewhere safe; they are shown only
        now.
      </p>
      <ul className="tfa-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button
        type="button"
        className="sbr-btn sbr-btn--primary"
        data-testid="tfa-saved"
        onClick={onDone}
      >
        I have saved them
      </button>
    </section>
  );
}

function Verify({ onDone }: { readonly onDone: () => void }): ReactElement {
  const [value, setValue] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const body = recovery ? { recoveryCode: value.trim() } : { code: value.trim() };
    api('/auth/2fa/verify', { method: 'POST', body })
      .then(onDone)
      .catch((e: unknown) => {
        setError(problem(e));
      });
  };
  return (
    <form className="sbr-panel account-form" onSubmit={submit} data-testid="tfa-verify">
      <h1>Two-factor sign-in</h1>
      <AccountField
        label={recovery ? 'Recovery code' : 'Code from the app'}
        type="text"
        autoComplete="one-time-code"
        value={value}
        testId="tfa-code"
        onChange={setValue}
      />
      <FormError text={error} testId="tfa-error" />
      <button type="submit" className="sbr-btn sbr-btn--primary" data-testid="tfa-submit">
        Sign in
      </button>
      <button
        type="button"
        className="sbr-btn"
        data-testid="tfa-use-recovery"
        onClick={() => {
          setRecovery(!recovery);
          setValue('');
        }}
      >
        {recovery ? 'Use the app code instead' : 'Use a recovery code instead'}
      </button>
    </form>
  );
}

export function TwoFactorPage({ step }: { readonly step: 'enrol' | 'code' }): ReactElement {
  const { refresh } = useSession();
  const [codes, setCodes] = useState<readonly string[] | null>(null);
  const finish = (): void => {
    void refresh();
  };
  if (codes !== null) return <Codes codes={codes} onDone={finish} />;
  return step === 'enrol' ? <Enrol done={setCodes} /> : <Verify onDone={finish} />;
}
