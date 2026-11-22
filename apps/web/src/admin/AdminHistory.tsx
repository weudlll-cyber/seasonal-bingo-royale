/**
 * @file   apps/web/src/admin/AdminHistory.tsx
 * @module web/admin
 * @brief  The admin area's History: every change, newest first, with "Undo this change".
 *
 * Responsibility: what GET /admin/history answers, 50 at a time with "Show older": when, who
 *                 (or "a removed account"), what changed in plain words, old → new (./changeText)
 *                 and the comment; a settings change has "Undo this change", which asks the
 *                 server to undo it as a new version (admin-area §6, §8 (k)) and reloads the
 *                 list. The server checks every permission and refuses an undo with nothing
 *                 left to undo, which the page says.
 * Depends on:     react, ../game/labels, ../shell/http, ./AdminNav, ./changeText, ./admin.css
 * Used by:        ./AdminArea
 * Spec:           docs/concepts/admin-area.md §4 (History), §6, §8 (k), §9 piece 2
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { problemText } from '../game/labels.js';
import { api, ApiError } from '../shell/http.js';
import { AdminNav } from './AdminNav.js';
import { changeLines, commentOf, when, type Defaults, type HistoryEntry } from './changeText.js';
import './admin.css';

interface HistoryPage {
  readonly entries: readonly HistoryEntry[];
  readonly more: boolean;
  readonly defaults: Defaults;
}

const failure = (e: unknown): string =>
  e instanceof ApiError ? problemText(e.code) : problemText('');

// The pages loaded so far, "Show older" and undo; an error as a sentence.
function useHistory() {
  const [pages, setPages] = useState<readonly HistoryPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api<HistoryPage>('/admin/history')
      .then((page) => {
        setPages([page]);
      })
      .catch((e: unknown) => {
        setError(failure(e));
      });
  }, []);
  useEffect(reload, [reload]);
  const entries = pages?.flatMap((p) => p.entries) ?? [];
  const older = (): void => {
    const before = entries.at(-1)?.id;
    if (before === undefined) return;
    void api<HistoryPage>(`/admin/history?before=${String(before)}`).then((page) => {
      setPages((now) => [...(now ?? []), page]);
    });
  };
  const undo = (id: number): void => {
    setError(null);
    api(`/admin/history/${String(id)}/undo`, { method: 'POST', body: {} })
      .then(reload)
      .catch((e: unknown) => {
        setError(failure(e));
      });
  };
  return { pages, entries, last: pages?.at(-1), error, older, undo };
}

export function AdminHistory(): ReactElement {
  const { pages, entries, last, error, older, undo } = useHistory();
  return (
    <div className="admin-page sbr-stack" data-testid="admin-history">
      <h1>History</h1>
      <AdminNav current="history" />
      {error === null ? null : <p className="lobby-error">{error}</p>}
      {pages !== null && entries.length === 0 ? <p className="sbr-muted">No change yet.</p> : null}
      <ol className="admin-history">
        {entries.map((e) => (
          <HistoryItem key={e.id} entry={e} defaults={last?.defaults ?? {}} onUndo={undo} />
        ))}
      </ol>
      {last?.more === true ? (
        <button type="button" className="sbr-btn" onClick={older}>
          Show older
        </button>
      ) : null}
    </div>
  );
}

// One change: when and who, what changed, its comment, and undo for a settings change.
function HistoryItem(props: {
  readonly entry: HistoryEntry;
  readonly defaults: Defaults;
  readonly onUndo: (id: number) => void;
}): ReactElement {
  const e = props.entry;
  const comment = commentOf(e);
  return (
    <li className="admin-match sbr-stack" data-testid={`admin-history-${String(e.id)}`}>
      <p className="sbr-muted admin-match-facts">
        {when(e.at)} · {e.actor ?? 'a removed account'}
      </p>
      {changeLines(e, props.defaults).map((line) => (
        <p key={line}>{line}</p>
      ))}
      {comment === null ? null : <p className="sbr-muted">“{comment}”</p>}
      {e.undoable ? (
        <button
          type="button"
          className="sbr-btn"
          onClick={() => {
            props.onUndo(e.id);
          }}
        >
          Undo this change
        </button>
      ) : null}
    </li>
  );
}
