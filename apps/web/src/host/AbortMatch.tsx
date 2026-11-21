/**
 * @file   apps/web/src/host/AbortMatch.tsx
 * @module web/host
 * @brief  "Abort match" with a reason, for the host in the lobby and while the match runs.
 *
 * Responsibility: a reason (at least 3 characters, shown to players) and the button; the
 *                 server ends the match and every screen shows the cancelled-match page
 *                 (D17). The server refuses anyone but the host; the admin area's Overview
 *                 uses it with its own route, which only Admins may call.
 * Depends on:     react, ../shell/http
 * Used by:        ./HostConsole, ./HostLobby, ../admin/AdminOverview
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §13
 */
import { useState, type ReactElement } from 'react';

import { api } from '../shell/http.js';

interface AbortMatchProps {
  readonly code: string;
  // The admin area aborts through its own route (admin-area §4); the host through the match's.
  readonly path?: string;
  // Told once the server took the abort (the Overview reloads its list).
  readonly onDone?: () => void;
}

export function AbortMatch({ code, path, onDone }: AbortMatchProps): ReactElement {
  const [reason, setReason] = useState('');
  return (
    <form
      className="sbr-row"
      onSubmit={(e) => {
        e.preventDefault();
        void api(path ?? `/matches/${code}/abort`, { method: 'POST', body: { reason } }).then(
          onDone,
        );
      }}
    >
      <input
        className="sbr-input"
        style={{ flex: '1 1 12rem' }}
        placeholder="Reason (shown to players)"
        value={reason}
        minLength={3}
        required
        onChange={(e) => {
          setReason(e.target.value);
        }}
        data-testid="abort-reason"
      />
      <button type="submit" className="sbr-btn sbr-btn--danger" data-testid="abort-match">
        Abort match
      </button>
    </form>
  );
}
