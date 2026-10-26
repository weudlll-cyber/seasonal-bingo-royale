/**
 * @file   apps/web/src/shell/Maintenance.tsx
 * @module web/shell
 * @brief  The maintenance page and the host's maintenance banner (`sbr maintenance on`).
 *
 * Responsibility: the page shown instead of the lobby and the create form while maintenance
 *                 is on: "Maintenance — we'll be back shortly", the operator's reason if one
 *                 was given, and that matches already running play to the end. The banner
 *                 above the host console says the same in one line, so the host knows the
 *                 running match goes on and no new one can start.
 * Depends on:     react, ./useMaintenance (type), ./shell.css
 * Used by:        ./AppShell
 * Spec:           docs/spec/09-deployment-architecture.md §4; docs/spec/01-game-design.md §13
 */
import type { ReactElement } from 'react';

import type { MaintenanceState } from './useMaintenance.js';

export function MaintenancePage({ state }: { readonly state: MaintenanceState }): ReactElement {
  return (
    <section className="sbr-panel sbr-stack maintenance-page" data-testid="maintenance-page">
      <h1>Maintenance — we&apos;ll be back shortly</h1>
      {state.reason === null ? null : <p data-testid="maintenance-reason">{state.reason}</p>}
      <p className="sbr-muted">
        No new matches can be created or started for now. Matches already running play to the end.
      </p>
    </section>
  );
}

export function MaintenanceBanner({ state }: { readonly state: MaintenanceState }): ReactElement {
  return (
    <p className="maintenance-banner" role="status" data-testid="maintenance-banner">
      Maintenance: no new match can be created or started; this match plays to the end.
      {state.reason === null ? '' : ` ${state.reason}`}
    </p>
  );
}
