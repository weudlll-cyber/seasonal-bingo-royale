/**
 * @file   apps/web/src/admin/AdminAccounts.tsx
 * @module web/admin
 * @brief  The admin area's Players and accounts: find an account and act on it (standalone).
 *
 * Responsibility: website mode: only a note, accounts and roles come from the website (D41, D46).
 *                 Standalone: search by start of name or e-mail (GET /admin/accounts); each
 *                 account with roles, status, second step, last sign-in and actions: Organizer,
 *                 Admin (owner's `admins.manage`), lock, reset second step (owner's), end
 *                 sessions; e-mails and finding by them for the owner only (2026-11-21).
 *                 STEP_UP_REQUIRED waits for "Confirm it is you" (./StepUp), then reruns; the list
 *                 reloads after each. The server checks every permission and refuses one's own
 *                 account and an owner's for an Admin.
 * Depends on:     react, ../game/labels, ../shell/http, ../shell/session, ./AccountCard,
 *                 ./AdminNav, ./StepUp, ./admin.css
 * Used by:        ./AdminArea
 * Spec:           docs/concepts/admin-area.md §2, §4 (Players and accounts), §7, §9 piece 8
 */
import { useCallback, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { useSession } from '../shell/session.js';
import { AccountCard, type AccountView, type Action } from './AccountCard.js';
import { AdminNav } from './AdminNav.js';
import { StepUp } from './StepUp.js';
import './admin.css';

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

// The search, its answer, and an action waiting for the second step.
function useAccounts() {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<readonly AccountView[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Action | null>(null);
  const search = useCallback((q: string) => {
    api<{ accounts: AccountView[] }>(`/admin/accounts?q=${encodeURIComponent(q)}`)
      .then((r) => {
        setFound(r.accounts);
      })
      .catch((e: unknown) => {
        setMessage(failure(e));
      });
  }, []);
  const act = (a: Action): void => {
    setMessage(null);
    api(`/admin/accounts/${a.accountId}/${a.path}`, { method: 'POST', body: a.body })
      .then(() => {
        setWaiting(null);
        setMessage(`Done: ${a.label}.`);
        search(query);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'STEP_UP_REQUIRED') setWaiting(a);
        else setMessage(failure(e));
      });
  };
  return { query, setQuery, found, message, setMessage, waiting, search, act };
}

export function AdminAccounts(): ReactElement {
  const { session, can } = useSession();
  const a = useAccounts();
  if (session?.authMode === 'website') return <WebsiteNote />;
  return (
    <div className="admin-page sbr-stack" data-testid="admin-accounts">
      <h1>Players and accounts</h1>
      <AdminNav current="accounts" />
      <SearchForm
        query={a.query}
        byEmail={can('accounts.email')}
        onQuery={a.setQuery}
        onSearch={a.search}
      />
      {a.message === null ? null : <p role="status">{a.message}</p>}
      {a.waiting === null ? null : (
        <StepUp
          onPassed={() => {
            if (a.waiting !== null) a.act(a.waiting);
          }}
          onFailed={a.setMessage}
        />
      )}
      {a.found === null ? null : a.found.length === 0 ? (
        <p className="sbr-muted">No account starts like this.</p>
      ) : (
        <ol className="admin-history">
          {a.found.map((x) => (
            <AccountCard
              key={x.id}
              account={x}
              may={{ admins: can('admins.manage'), resetSecondStep: can('twofactor.reset') }}
              onAct={a.act}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

// Website mode: the website decides accounts and roles (D41, D46).
function WebsiteNote(): ReactElement {
  return (
    <div className="admin-page sbr-stack" data-testid="admin-accounts">
      <h1>Players and accounts</h1>
      <AdminNav current="accounts" />
      <p className="sk-panel">
        Accounts and roles come from the website: who may start games and who is an admin is set
        there.
      </p>
    </div>
  );
}

function SearchForm(props: {
  readonly query: string;
  // The owner also finds by e-mail (2026-11-21).
  readonly byEmail: boolean;
  readonly onQuery: (q: string) => void;
  readonly onSearch: (q: string) => void;
}): ReactElement {
  return (
    <form
      className="sk-panel sbr-stack"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSearch(props.query.trim());
      }}
    >
      <label className="sk-field">
        <span>{props.byEmail ? 'Name or e-mail starts with' : 'Name starts with'}</span>
        <input
          className="sk-input"
          value={props.query}
          data-testid="accounts-search"
          onChange={(e) => {
            props.onQuery(e.target.value);
          }}
        />
      </label>
      <button type="submit" className="sk-btn sk-btn--primary">
        Find accounts
      </button>
    </form>
  );
}
