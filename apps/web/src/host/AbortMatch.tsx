/**
 * @file   apps/web/src/host/AbortMatch.tsx
 * @module web/host
 * @brief  "Abort match" with a reason, for the host in the lobby and while the match runs.
 *
 * Responsibility: a reason (at least 3 characters, shown to players) and the button; the
 *                 server ends the match and every screen shows the cancelled-match page
 *                 (D17). The server refuses anyone but the host.
 * Depends on:     react, ../shell/http
 * Used by:        ./HostConsole, ./HostLobby
 * Spec:           docs/spec/05-api-design.md §2.3; docs/spec/01-game-design.md §13
 */
import { useState, type ReactElement } from 'react';

import { api } from '../shell/http.js';

export function AbortMatch({ code }: { readonly code: string }): ReactElement {
  const [reason, setReason] = useState('');
  return (
    <form
      className="sbr-row"
      onSubmit={(e) => {
        e.preventDefault();
        void api(`/matches/${code}/abort`, { method: 'POST', body: { reason } });
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
