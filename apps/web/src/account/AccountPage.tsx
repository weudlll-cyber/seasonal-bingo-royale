/**
 * @file   apps/web/src/account/AccountPage.tsx
 * @module web/account
 * @brief  The signed-in player's account: profile link, "Download my data", "Delete my account".
 *
 * Responsibility: link to the own public profile; download everything the server keeps about
 *                 the account as a JSON file (GET /me/export, 03 §19); delete the account only
 *                 after a second step that asks for the password (DELETE /me { password }, 05
 *                 §2.2), saying what goes and what stays (match results under an anonymous
 *                 name); afterwards the session is gone and the page says the account was
 *                 deleted. Without a signed-in account it points to sign-in.
 * Depends on:     react, ../shell/http, ../shell/router, ../shell/session, ../game/socket,
 *                 ./formParts, ./account.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/05-api-design.md §2.2; docs/spec/03-security-architecture.md §19
 */
import { useState, type ReactElement, type SyntheticEvent } from 'react';

import { resetSocket } from '../game/socket.js';
import { api, ApiError } from '../shell/http.js';
import { hrefOf } from '../shell/router.js';
import { useSession } from '../shell/session.js';
import { AccountField, FormError } from './formParts.js';
import './account.css';

const EXPORT_FILE = 'seasonal-bingo-royale-data.json';

export function AccountPage(): ReactElement {
  const { session } = useSession();
  const [deleted, setDeleted] = useState(false);
  const name = session?.account?.displayName ?? null;
  if (deleted) {
    return (
      <section className="sbr-panel sbr-stack account-page" data-testid="account-deleted">
        <h1>Account deleted</h1>
        <p>Your account and your personal data have been deleted. Thank you for playing.</p>
        <a className="sbr-btn" href={hrefOf({ name: 'lobby' })}>
          To the lobby
        </a>
      </section>
    );
  }
  if (name === null) {
    return (
      <section className="sbr-panel sbr-stack account-page" data-testid="account-page">
        <h1>Your account</h1>
        <p>Sign in to see your account.</p>
        <a className="sbr-btn sbr-btn--primary" href={hrefOf({ name: 'signIn' })}>
          Sign in
        </a>
      </section>
    );
  }
  return (
    <section className="sbr-panel sbr-stack account-page" data-testid="account-page">
      <h1>Your account</h1>
      <p>
        Signed in as <strong>{name}</strong> ·{' '}
        <a href={hrefOf({ name: 'player', displayName: name })}>your public profile</a>
      </p>
      <DownloadData />
      <DeleteAccount
        onDeleted={() => {
          setDeleted(true);
        }}
      />
    </section>
  );
}

function DownloadData(): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const download = (): void => {
    setError(null);
    api<unknown>('/me/export').then(
      (data) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        );
        const link = document.createElement('a');
        link.href = url;
        link.download = EXPORT_FILE;
        link.click();
        URL.revokeObjectURL(url);
      },
      () => {
        setError('Your data could not be downloaded. Please try again.');
      },
    );
  };
  return (
    <div className="account-part sbr-stack">
      <h2>Your data</h2>
      <p className="sbr-muted">
        One file (JSON) with your account, the matches you played, your league points and badges.
      </p>
      <button type="button" className="sbr-btn" data-testid="download-data" onClick={download}>
        Download my data
      </button>
      <FormError text={error} testId="download-error" />
    </div>
  );
}

function DeleteAccount({ onDeleted }: { readonly onDeleted: () => void }): ReactElement {
  const [asked, setAsked] = useState(false);
  return (
    <div className="account-part sbr-stack">
      <h2>Delete my account</h2>
      <p className="sbr-muted">
        Deletes your account, your sign-ins, league points and badges for good. Results of matches
        you played stay, under an anonymous name, so other players' places stay right.
      </p>
      {asked ? (
        <DeleteForm
          onDeleted={onDeleted}
          onCancel={() => {
            setAsked(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="sbr-btn sbr-btn--danger"
          data-testid="delete-account"
          onClick={() => {
            setAsked(true);
          }}
        >
          Delete my account
        </button>
      )}
    </div>
  );
}

// The second step: the password, then DELETE /me; the session ends with the account.
function DeleteForm(props: {
  readonly onDeleted: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const { refresh } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = (event: SyntheticEvent): void => {
    event.preventDefault();
    setBusy(true);
    api('/me', { method: 'DELETE', body: { password } })
      .then(async () => {
        resetSocket();
        props.onDeleted();
        await refresh();
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(
          e instanceof ApiError && e.code === 'PASSWORD_REQUIRED'
            ? 'That is not your password.'
            : 'Something went wrong — please try again.',
        );
      });
  };
  return (
    <form className="account-form account-delete" onSubmit={confirm}>
      <AccountField
        label="Your password, to confirm"
        type="password"
        autoComplete="current-password"
        value={password}
        testId="delete-password"
        onChange={setPassword}
      />
      <FormError text={error} testId="delete-error" />
      <div className="sbr-row">
        <button
          type="submit"
          className="sbr-btn sbr-btn--danger"
          data-testid="delete-confirm"
          disabled={busy || password === ''}
        >
          Delete for good
        </button>
        <button type="button" className="sbr-btn" onClick={props.onCancel}>
          Keep my account
        </button>
      </div>
    </form>
  );
}
