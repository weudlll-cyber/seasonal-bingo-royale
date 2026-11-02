/**
 * @file   apps/web/src/host/JumpAhead.tsx
 * @module web/host
 * @brief  Development only: "Jump ahead 1 hour" / "Jump ahead 1 day" for an asynchronous match.
 *
 * Responsibility: one line in the host console's header for an asynchronous match: two buttons
 *                 that move the match ahead on the server's development clock (POST
 *                 /api/v1/dev/time-travel), so the owner sees draws, cuts, the lobby's 24 hours
 *                 (D31) and the players' "While you were away" without commands, and a note while
 *                 it runs and with the steps that ran. Loaded on demand only in development
 *                 builds (./HostConsole), so a production build has neither the buttons nor the
 *                 route's address.
 * Depends on:     react, ../shell/http
 * Used by:        ./HostConsole (lazy, development only)
 * Spec:           docs/spec/12-testing-strategy.md §4 (journey 2); docs/spec/01-game-design.md §11
 */
import { useState, type ReactElement } from 'react';

import { api, ApiError } from '../shell/http.js';

const JUMPS = [
  { label: 'Jump ahead 1 hour', ms: 3_600_000 },
  { label: 'Jump ahead 1 day', ms: 86_400_000 },
] as const;

export function JumpAhead({ code }: { readonly code: string }): ReactElement {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const jump = (label: string, ms: number): void => {
    setBusy(true);
    // A day of draws takes the server a few seconds (more with screens open).
    setNote('Moving the match ahead…');
    api<{ actions: number }>('/dev/time-travel', { method: 'POST', body: { code, ms } })
      .then((r) => {
        setNote(`${label.replace('Jump ahead', 'Jumped')}: ${String(r.actions)} steps ran.`);
      })
      .catch((error: unknown) => {
        setNote(
          error instanceof ApiError ? `The jump failed (${error.code}).` : 'The jump failed.',
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <div
      className="sbr-row jump-ahead"
      role="group"
      aria-label="Time travel"
      data-testid="jump-ahead"
    >
      <span className="sbr-muted">Development only:</span>
      {JUMPS.map((j) => (
        <button
          key={j.ms}
          type="button"
          className="sbr-btn"
          disabled={busy}
          onClick={() => {
            jump(j.label, j.ms);
          }}
        >
          {j.label}
        </button>
      ))}
      {note === null ? null : (
        <span role="status" data-testid="jump-note">
          {note}
        </span>
      )}
    </div>
  );
}
